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
        "markup.inline.raw.markdown",
        "markup.inline.raw.string.markdown",
        "markup.inline.raw",
        "markup.raw.inline.markdown",
        "string.other.inline.raw.markdown",
        "text.html.markdown",
    ];
}

const MARKDOWN_INLINE_EDITOR_COLOR_KEYS = [
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "heading5",
    "heading6",
    "inlineCode",
    "inlineCodeBackground",
    "inlineCodeBorder",
] as const;

export type MarkdownInlineEditorColorKey =
    (typeof MARKDOWN_INLINE_EDITOR_COLOR_KEYS)[number];

/** Keys accepted by `applyMarkdownInlineEditorColors` (from `markdownInlineEditor.colors.*`). */
export function markdownInlineEditorColorKeys(): readonly MarkdownInlineEditorColorKey[] {
    return MARKDOWN_INLINE_EDITOR_COLOR_KEYS;
}

/**
 * Applies `markdownInlineEditor.colors.*` from VS Code settings over token-derived
 * markdown heading and inline-code variables.
 */
export function applyMarkdownInlineEditorColors(
    variables: Record<string, string>,
    colors: Readonly<Partial<Record<MarkdownInlineEditorColorKey, string>>>,
): void {
    const headingMap: ReadonlyArray<
        readonly [MarkdownInlineEditorColorKey, string]
    > = [
        ["heading1", "--acp-markdown-h1-foreground"],
        ["heading2", "--acp-markdown-h2-foreground"],
        ["heading3", "--acp-markdown-h3-foreground"],
        ["heading4", "--acp-markdown-h4-foreground"],
    ];
    for (const [sourceKey, cssVar] of headingMap) {
        const value = colors[sourceKey];
        if (value !== undefined && value.length > 0) {
            variables[cssVar] = value;
        }
    }
    const inlineCode = colors.inlineCode;
    if (inlineCode !== undefined && inlineCode.length > 0) {
        variables["--acp-markdown-inline-code-foreground"] = inlineCode;
    }
    const inlineCodeBorder = colors.inlineCodeBorder;
    if (inlineCodeBorder !== undefined && inlineCodeBorder.length > 0) {
        variables["--acp-markdown-inline-code-border"] = inlineCodeBorder;
    }
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

/** Token colors for fenced-code highlighting in agent markdown. */
export function buildSyntaxHighlightCssVariables(
    theme: ColorThemeJson,
    extraRules: readonly TokenColorRule[] = [],
): Record<string, string> {
    const rules = [...(theme.tokenColors ?? []), ...extraRules];
    const semantic = theme as ColorThemeJson & {
        semanticTokenColors?: Record<string, string>;
    };
    const semanticColors = semantic.semanticTokenColors ?? {};
    return {
        "--vscode-symbolIcon-keywordForeground": resolveForegroundFromScopeList(
            ["keyword.control", "keyword.other", "storage.type"],
            rules,
            "#c586c0",
        ),
        "--vscode-stringForeground": resolveForegroundFromScopeList(
            [
                "string",
                "string.quoted",
                "string.quoted.double",
                "string.quoted.double.json",
            ],
            rules,
            semanticColors.stringLiteral ?? "#ce9178",
        ),
        "--vscode-numberLiteralForeground": resolveForegroundFromScopeList(
            ["constant.numeric", "constant.numeric.json"],
            rules,
            semanticColors.numberLiteral ?? "#b5cea8",
        ),
        "--acp-code-token-comment-foreground": resolveForegroundFromScopeList(
            ["comment", "punctuation.definition.comment"],
            rules,
            "#6a9955",
        ),
    };
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

/** CSS variables passed to the webview for agent markdown (init + theme updates). */
export const WEBVIEW_MARKDOWN_THEME_VARIABLE_NAMES = [
    "--acp-markdown-font-size",
    "--acp-markdown-line-height",
    "--acp-markdown-h1-foreground",
    "--acp-markdown-h2-foreground",
    "--acp-markdown-h3-foreground",
    "--acp-markdown-h4-foreground",
    "--acp-markdown-inline-code-foreground",
    "--acp-markdown-inline-code-border",
    "--vscode-symbolIcon-keywordForeground",
    "--vscode-stringForeground",
    "--vscode-numberLiteralForeground",
    "--acp-code-token-comment-foreground",
] as const;

export function pickWebviewMarkdownThemeVariables(
    variables: Record<string, string>,
): Record<string, string> {
    const picked: Record<string, string> = {};
    for (const name of WEBVIEW_MARKDOWN_THEME_VARIABLE_NAMES) {
        const value = variables[name];
        if (typeof value === "string" && value.trim().length > 0) {
            picked[name] = value.trim();
        }
    }
    return picked;
}
