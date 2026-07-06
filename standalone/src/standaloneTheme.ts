import {
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
} from "../../src/platform/markdownThemeResolver";
import darkModern from "../themes/dark-modern.json";

type StandaloneThemeApiResponse = {
    variables: Record<string, string>;
    source?: string;
    colorTheme?: string;
};

const FALLBACK_THEME = darkModern as ColorThemeJson;

function fallbackThemeVariables(): Record<string, string> {
    const colors = FALLBACK_THEME.colors ?? {};
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
    return {
        ...variables,
        ...buildMarkdownThemeCssVariables(FALLBACK_THEME),
        ...buildMarkdownTypographyCssVariables({
            fontSizePx: 14,
            lineHeight: 1.6,
        }),
        ...buildSyntaxHighlightCssVariables(FALLBACK_THEME),
    };
}

export function applyCssVariables(variables: Record<string, string>): void {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) {
        root.style.setProperty(name, value);
    }
}

export async function fetchStandaloneThemeVariables(): Promise<
    Record<string, string>
> {
    try {
        const response = await fetch("/api/standalone-theme");
        if (!response.ok) {
            return fallbackThemeVariables();
        }
        const body = (await response.json()) as StandaloneThemeApiResponse;
        if (
            body.variables === null ||
            typeof body.variables !== "object" ||
            Object.keys(body.variables).length === 0
        ) {
            return fallbackThemeVariables();
        }
        return body.variables;
    } catch {
        return fallbackThemeVariables();
    }
}

export async function applyStandaloneVsCodeTheme(): Promise<void> {
    applyCssVariables(await fetchStandaloneThemeVariables());
}
