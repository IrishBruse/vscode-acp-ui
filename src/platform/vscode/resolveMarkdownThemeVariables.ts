import { readFile } from "node:fs/promises";
import path from "node:path";
import { extensions, workspace } from "vscode";
import {
    applyMarkdownInlineEditorColors,
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
    markdownInlineEditorColorKeys,
    mergeColorThemeJson,
    type TokenColorCustomizations,
    tokenColorRulesFromCustomizations,
} from "../markdownThemeResolver";

async function readColorThemeJson(
    themePath: string,
    visited: Set<string> = new Set(),
): Promise<ColorThemeJson> {
    const resolved = path.resolve(themePath);
    if (visited.has(resolved)) {
        return {};
    }
    visited.add(resolved);
    const raw = await readFile(resolved, "utf8");
    const parsed = JSON.parse(raw) as ColorThemeJson;
    if (parsed.include === undefined) {
        return parsed;
    }
    const included = await readColorThemeJson(
        path.join(path.dirname(resolved), parsed.include),
        visited,
    );
    return mergeColorThemeJson(included, parsed);
}

function findThemePath(themeLabel: string): string | undefined {
    for (const extension of extensions.all) {
        const contributes = extension.packageJSON.contributes as
            | { themes?: Array<{ label?: string; id?: string; path: string }> }
            | undefined;
        const themes = contributes?.themes;
        if (!Array.isArray(themes)) {
            continue;
        }
        for (const theme of themes) {
            if (theme.label === themeLabel || theme.id === themeLabel) {
                return path.join(extension.extensionPath, theme.path);
            }
        }
    }
    return undefined;
}

function readStringRecord(value: unknown): Record<string, string> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "string" && entry.length > 0) {
            out[key] = entry;
        }
    }
    return out;
}

function resolveWorkbenchColorCustomizations(
    themeLabel: string,
): Record<string, string> {
    const raw = workspace
        .getConfiguration("workbench")
        .get<Record<string, unknown>>("colorCustomizations");
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }
    const global = readStringRecord(raw);
    const themeKey = `[${themeLabel}]`;
    const scoped = raw[themeKey];
    const scopedColors = readStringRecord(scoped);
    return { ...global, ...scopedColors };
}

function readMarkdownInlineEditorColors(): Record<string, string> {
    const config = workspace.getConfiguration("markdownInlineEditor");
    const colors: Record<string, string> = {};
    for (const key of markdownInlineEditorColorKeys()) {
        const value = config.get<string>(`colors.${key}`);
        if (typeof value === "string" && value.length > 0) {
            colors[key] = value;
        }
    }
    return colors;
}

/**
 * Resolves markdown heading colors and preview typography from the active VS Code
 * theme, editor settings, and markdown preview settings.
 */
export async function resolveMarkdownThemeVariables(): Promise<
    Record<string, string>
> {
    const themeLabel = workspace
        .getConfiguration("workbench")
        .get<string>("colorTheme");

    const markdownConfig = workspace.getConfiguration("markdown");
    const editorConfig = workspace.getConfiguration("editor");
    const previewFontSize = markdownConfig.get<number>("preview.fontSize");
    const editorFontSize = editorConfig.get<number>("fontSize");
    const fontSizePx =
        typeof previewFontSize === "number" && previewFontSize > 0
            ? previewFontSize
            : typeof editorFontSize === "number" && editorFontSize > 0
              ? editorFontSize
              : 14;
    const previewLineHeight = markdownConfig.get<number>("preview.lineHeight");
    const lineHeight =
        typeof previewLineHeight === "number" && previewLineHeight > 0
            ? previewLineHeight
            : 1.6;

    const typography = buildMarkdownTypographyCssVariables({
        fontSizePx,
        lineHeight,
    });

    if (themeLabel === undefined || themeLabel.length === 0) {
        return typography;
    }

    const themePath = findThemePath(themeLabel);
    if (themePath === undefined) {
        return typography;
    }

    const theme = await readColorThemeJson(themePath);
    const colorCustomizations = resolveWorkbenchColorCustomizations(themeLabel);
    const mergedTheme = mergeColorThemeJson(theme, {
        colors: colorCustomizations,
    });
    const customizations = editorConfig.get<TokenColorCustomizations>(
        "tokenColorCustomizations",
    );
    const customRules = tokenColorRulesFromCustomizations(
        customizations,
        themeLabel,
    );
    const variables: Record<string, string> = {
        ...buildMarkdownThemeCssVariables(mergedTheme, customRules),
        ...buildSyntaxHighlightCssVariables(mergedTheme, customRules),
        ...typography,
    };
    applyMarkdownInlineEditorColors(
        variables,
        readMarkdownInlineEditorColors(),
    );
    return variables;
}
