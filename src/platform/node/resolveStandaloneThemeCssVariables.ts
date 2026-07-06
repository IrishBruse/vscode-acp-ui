import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import {
    applyMarkdownInlineEditorColors,
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
    mergeColorThemeJson,
    type TokenColorCustomizations,
    tokenColorRulesFromCustomizations,
} from "../markdownThemeResolver";

export type VscodeSettingsSnapshot = {
    colorTheme: string | undefined;
    colorCustomizations: Record<string, string>;
    tokenColorCustomizations: TokenColorCustomizations | undefined;
    markdownInlineEditorColors: Record<string, string>;
    editorFontFamily: string | undefined;
    editorFontSize: number | undefined;
    markdownPreviewFontSize: number | undefined;
    markdownPreviewLineHeight: number | undefined;
};

export type StandaloneThemeResolution = {
    variables: Record<string, string>;
    source: string;
    colorTheme: string | undefined;
};

const MARKDOWN_INLINE_EDITOR_PREFIX = "markdownInlineEditor.colors.";

/** Default VS Code user settings path on Linux (override with `ACP_UI_VSCODE_SETTINGS`). */
export function defaultVscodeUserSettingsPath(): string {
    const fromEnv = process.env.ACP_UI_VSCODE_SETTINGS?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0) {
        return fromEnv;
    }
    return join(homedir(), ".config", "Code", "User", "settings.json");
}

export function parseVscodeUserSettings(text: string): VscodeSettingsSnapshot {
    const parsed = parseJsonc(text) as Record<string, unknown> | undefined;
    const record = parsed ?? {};

    const colorCustomizations = readStringRecord(
        record["workbench.colorCustomizations"],
    );
    const tokenColorCustomizations = readTokenColorCustomizations(
        record["editor.tokenColorCustomizations"],
    );

    const markdownInlineEditorColors: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
        if (
            key.startsWith(MARKDOWN_INLINE_EDITOR_PREFIX) &&
            typeof value === "string" &&
            value.length > 0
        ) {
            markdownInlineEditorColors[
                key.slice(MARKDOWN_INLINE_EDITOR_PREFIX.length)
            ] = value;
        }
    }

    return {
        colorTheme: readString(record["workbench.colorTheme"]),
        colorCustomizations,
        tokenColorCustomizations,
        markdownInlineEditorColors,
        editorFontFamily: readString(record["editor.fontFamily"]),
        editorFontSize: readPositiveNumber(record["editor.fontSize"]),
        markdownPreviewFontSize: readPositiveNumber(
            record["markdown.preview.fontSize"],
        ),
        markdownPreviewLineHeight: readPositiveNumber(
            record["markdown.preview.lineHeight"],
        ),
    };
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
    return typeof value === "number" && value > 0 ? value : undefined;
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

function readTokenColorCustomizations(
    value: unknown,
): TokenColorCustomizations | undefined {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    return value as TokenColorCustomizations;
}

export function vscodeExtensionSearchRoots(): string[] {
    const roots = [
        join(homedir(), ".vscode", "extensions"),
        "/usr/share/code/resources/app/extensions",
        "/usr/share/cursor/resources/app/extensions",
    ];
    const fromEnv = process.env.VSCODE_EXTENSIONS?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0) {
        roots.unshift(fromEnv);
    }
    return roots.filter((root) => existsSync(root));
}

export function findContributedThemePath(
    themeLabel: string,
    extensionRoots: readonly string[] = vscodeExtensionSearchRoots(),
): string | undefined {
    for (const root of extensionRoots) {
        let entries: string[] = [];
        try {
            entries = readdirSync(root);
        } catch {
            continue;
        }
        for (const entry of entries) {
            const packagePath = join(root, entry, "package.json");
            if (!existsSync(packagePath)) {
                continue;
            }
            try {
                const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
                    contributes?: {
                        themes?: Array<{
                            label?: string;
                            id?: string;
                            path: string;
                        }>;
                    };
                };
                const themes = pkg.contributes?.themes;
                if (!Array.isArray(themes)) {
                    continue;
                }
                for (const theme of themes) {
                    if (theme.label === themeLabel || theme.id === themeLabel) {
                        return join(root, entry, theme.path);
                    }
                }
            } catch {}
        }
    }
    return undefined;
}

export function readColorThemeJsonSync(
    themePath: string,
    visited: Set<string> = new Set(),
): ColorThemeJson {
    const resolved = resolve(themePath);
    if (visited.has(resolved)) {
        return {};
    }
    visited.add(resolved);
    const parsed = JSON.parse(
        readFileSync(resolved, "utf-8"),
    ) as ColorThemeJson;
    if (parsed.include === undefined) {
        return parsed;
    }
    const included = readColorThemeJsonSync(
        join(dirname(resolved), parsed.include),
        visited,
    );
    return mergeColorThemeJson(included, parsed);
}

function workbenchColorCssVariables(
    colors: Record<string, string>,
): Record<string, string> {
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(colors)) {
        variables[`--vscode-${key.replace(/\./g, "-")}`] = value;
    }

    const foreground = colors.foreground ?? colors["editor.foreground"];
    if (foreground !== undefined) {
        variables["--vscode-foreground"] = foreground;
    }

    const widgetBorder =
        colors["widget.border"] ?? colors["editorWidget.border"];
    if (widgetBorder !== undefined) {
        variables["--vscode-widget-border"] = widgetBorder;
    }

    const descriptionForeground = colors.descriptionForeground;
    if (descriptionForeground !== undefined) {
        variables["--vscode-descriptionForeground"] = descriptionForeground;
    }

    const inactiveSelection =
        colors["editor.inactiveSelectionBackground"] ??
        colors["list.inactiveSelectionBackground"];
    if (inactiveSelection !== undefined) {
        variables["--vscode-editor-inactiveSelectionBackground"] =
            inactiveSelection;
    }

    const dropdownBorder =
        colors["dropdown.border"] ?? colors["input.border"] ?? widgetBorder;
    if (dropdownBorder !== undefined) {
        variables["--vscode-dropdown-border"] = dropdownBorder;
    }

    const codeSpanBorder = colors["markdown.extension.editor.codeSpan.border"];
    if (codeSpanBorder !== undefined) {
        variables["--vscode-markdown-extension-editor-codeSpan-border"] =
            codeSpanBorder;
    }

    const textPreformatBorder = colors["textPreformat.border"];
    if (textPreformatBorder !== undefined) {
        variables["--vscode-textPreformat-border"] = textPreformatBorder;
    }

    const textPreformatForeground = colors["textPreformat.foreground"];
    if (textPreformatForeground !== undefined) {
        variables["--vscode-textPreformat-foreground"] =
            textPreformatForeground;
    }

    return variables;
}

function chartAliasesFromColors(
    colors: Record<string, string>,
): Record<string, string> {
    const aliases: Record<string, string> = {};
    const green = colors["terminal.ansiGreen"];
    if (green !== undefined) {
        aliases["--vscode-charts-green"] = green;
    }
    const yellow = colors["terminal.ansiYellow"];
    if (yellow !== undefined) {
        aliases["--vscode-charts-yellow"] = yellow;
        aliases["--vscode-charts-orange"] = yellow;
        aliases["--vscode-editorWarning-foreground"] = yellow;
    }
    const red = colors["terminal.ansiRed"] ?? colors.errorForeground;
    if (red !== undefined) {
        aliases["--vscode-charts-red"] = red;
        aliases["--vscode-errorForeground"] = red;
    }
    return aliases;
}

export function buildStandaloneThemeCssVariables(
    settings: VscodeSettingsSnapshot,
    extensionRoots: readonly string[] = vscodeExtensionSearchRoots(),
): Record<string, string> {
    const themeLabel = settings.colorTheme;
    const baseThemePath =
        themeLabel !== undefined
            ? findContributedThemePath(themeLabel, extensionRoots)
            : undefined;
    const baseTheme =
        baseThemePath !== undefined
            ? readColorThemeJsonSync(baseThemePath)
            : {};
    const theme = mergeColorThemeJson(baseTheme, {
        colors: settings.colorCustomizations,
    });
    const customRules = tokenColorRulesFromCustomizations(
        settings.tokenColorCustomizations,
        themeLabel ?? "",
    );

    const fontSizePx =
        settings.markdownPreviewFontSize ?? settings.editorFontSize ?? 14;
    const lineHeight = settings.markdownPreviewLineHeight ?? 1.6;

    const variables: Record<string, string> = {
        ...workbenchColorCssVariables(theme.colors ?? {}),
        ...chartAliasesFromColors(theme.colors ?? {}),
        ...buildMarkdownThemeCssVariables(theme, customRules),
        ...buildMarkdownTypographyCssVariables({
            fontSizePx,
            lineHeight,
        }),
        ...buildSyntaxHighlightCssVariables(theme, customRules),
    };

    if (settings.editorFontFamily !== undefined) {
        variables["--vscode-editor-font-family"] = settings.editorFontFamily;
    }

    applyMarkdownInlineEditorColors(
        variables,
        settings.markdownInlineEditorColors,
    );

    return variables;
}

export function resolveStandaloneThemeCssVariables(options?: {
    settingsPath?: string;
    extensionRoots?: string[];
}): StandaloneThemeResolution {
    const settingsPath =
        options?.settingsPath ?? defaultVscodeUserSettingsPath();
    if (!existsSync(settingsPath)) {
        throw new Error(`VS Code settings not found: ${settingsPath}`);
    }
    const settings = parseVscodeUserSettings(
        readFileSync(settingsPath, "utf-8"),
    );
    const variables = buildStandaloneThemeCssVariables(
        settings,
        options?.extensionRoots,
    );
    return {
        variables,
        source: settingsPath,
        colorTheme: settings.colorTheme,
    };
}
