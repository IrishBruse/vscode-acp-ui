import { readFile } from "node:fs/promises";
import path from "node:path";
import { extensions, workspace } from "vscode";
import {
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    type ColorThemeJson,
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
    const customizations = editorConfig.get<TokenColorCustomizations>(
        "tokenColorCustomizations",
    );
    const customRules = tokenColorRulesFromCustomizations(
        customizations,
        themeLabel,
    );
    return {
        ...buildMarkdownThemeCssVariables(theme, customRules),
        ...typography,
    };
}
