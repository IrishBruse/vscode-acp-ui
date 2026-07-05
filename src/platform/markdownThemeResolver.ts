export type TokenColorRule = {
    scope?: string | string[];
    settings?: {
        foreground?: string;
        fontStyle?: string;
    };
};

export type ColorThemeJson = {
    include?: string;
    colors?: Record<string, string>;
    tokenColors?: TokenColorRule[];
};

type ThemeScopedTokenCustomizations = {
    textMateRules?: TokenColorRule[];
};

export type TokenColorCustomizations = {
    textMateRules?: TokenColorRule[];
    [themeName: string]:
        | TokenColorRule[]
        | ThemeScopedTokenCustomizations
        | undefined;
};

const HEADING_LEVELS = [1, 2, 3, 4] as const;

function normalizeRuleScopes(scope: string | string[] | undefined): string[] {
    if (scope === undefined) {
        return [];
    }
    return Array.isArray(scope) ? scope : [scope];
}

function selectorMatchesScopeList(
    selector: string,
    scopeList: readonly string[],
): boolean {
    const required = selector.trim().split(/\s+/).filter(Boolean);
    if (required.length === 0) {
        return false;
    }
    return required.every((req) =>
        scopeList.some((scope) => scope === req || scope.endsWith(`.${req}`)),
    );
}

function resolveForegroundFromScopeList(
    scopeList: readonly string[],
    rules: readonly TokenColorRule[],
    fallback: string,
): string {
    let bestScore = -1;
    let bestColor: string | undefined;
    for (const rule of rules) {
        const foreground = rule.settings?.foreground;
        if (foreground === undefined || foreground.length === 0) {
            continue;
        }
        for (const scopeEntry of normalizeRuleScopes(rule.scope)) {
            for (const alternative of scopeEntry.split(",")) {
                const selector = alternative.trim();
                if (!selectorMatchesScopeList(selector, scopeList)) {
                    continue;
                }
                const score = selector.split(/\s+/).filter(Boolean).length;
                if (score > bestScore) {
                    bestScore = score;
                    bestColor = foreground;
                } else if (score === bestScore) {
                    bestColor = foreground;
                }
            }
        }
    }
    return bestColor ?? fallback;
}

function headingScopeList(level: number): string[] {
    return [
        "entity.name.section.markdown",
        `heading.${level}.markdown`,
        "markup.heading.markdown",
        "markup.heading",
        "text.html.markdown",
    ];
}

function inlineCodeScopeList(): string[] {
    return [
        "markup.inline.raw.string.markdown",
        "markup.inline.raw",
        "markup.raw.inline.markdown",
        "string.other.inline.raw.markdown",
        "text.html.markdown",
    ];
}

export function mergeColorThemeJson(
    base: ColorThemeJson,
    overlay: ColorThemeJson,
): ColorThemeJson {
    return {
        colors: { ...base.colors, ...overlay.colors },
        tokenColors: [
            ...(base.tokenColors ?? []),
            ...(overlay.tokenColors ?? []),
        ],
    };
}

export function tokenColorRulesFromCustomizations(
    customizations: TokenColorCustomizations | undefined,
    themeLabel: string,
): TokenColorRule[] {
    if (customizations === undefined) {
        return [];
    }
    const globalRules = customizations.textMateRules ?? [];
    const themeEntry = customizations[themeLabel];
    const scopedRules = Array.isArray(themeEntry)
        ? themeEntry
        : (themeEntry?.textMateRules ?? []);
    return [...globalRules, ...scopedRules];
}

export function buildMarkdownThemeCssVariables(
    theme: ColorThemeJson,
    extraRules: readonly TokenColorRule[] = [],
): Record<string, string> {
    const colors = theme.colors ?? {};
    const editorForeground = colors["editor.foreground"] ?? "#cccccc";
    const rules = [...(theme.tokenColors ?? []), ...extraRules];
    const variables: Record<string, string> = {};

    for (const level of HEADING_LEVELS) {
        variables[`--acp-markdown-h${level}-foreground`] =
            resolveForegroundFromScopeList(
                headingScopeList(level),
                rules,
                editorForeground,
            );
    }

    const inlineCodeForeground = resolveForegroundFromScopeList(
        inlineCodeScopeList(),
        rules,
        colors["textPreformat.foreground"] ?? editorForeground,
    );
    variables["--acp-markdown-inline-code-foreground"] = inlineCodeForeground;

    const textPreformatBorder = colors["textPreformat.border"];
    if (textPreformatBorder !== undefined && textPreformatBorder.length > 0) {
        variables["--acp-markdown-inline-code-border"] = textPreformatBorder;
    }

    const codeSpanBorder = colors["markdown.extension.editor.codeSpan.border"];
    if (codeSpanBorder !== undefined && codeSpanBorder.length > 0) {
        variables["--acp-markdown-inline-code-border"] = codeSpanBorder;
    }

    return variables;
}

/** VS Code markdown preview typography scale (see markdown.css in markdown-language-features). */
export const MARKDOWN_HEADING_FONT_SIZE_EM = {
    h1: 2,
    h2: 1.5,
    h3: 1.25,
    h4: 1,
    h5: 0.875,
    h6: 0.85,
} as const;

export function buildMarkdownTypographyCssVariables(options: {
    fontSizePx: number;
    lineHeight: number;
}): Record<string, string> {
    return {
        "--acp-markdown-font-size": `${options.fontSizePx}px`,
        "--acp-markdown-line-height": String(options.lineHeight),
    };
}
