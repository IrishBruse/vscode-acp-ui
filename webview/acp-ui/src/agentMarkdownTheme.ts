const TEXT_PREFORMAT_VARS = [
    "--vscode-textPreformat-foreground",
    "--vscode-textPreformat-background",
    "--vscode-textPreformat-border",
] as const;

const TEXT_PREFORMAT_FALLBACKS: Record<
    (typeof TEXT_PREFORMAT_VARS)[number],
    string
> = {
    "--vscode-textPreformat-foreground": "var(--vscode-editor-foreground)",
    "--vscode-textPreformat-background":
        "color-mix(in srgb, var(--vscode-textCodeBlock-background) 85%, transparent)",
    "--vscode-textPreformat-border": "transparent",
};

const MARKDOWN_THEME_VARS = [
    "--acp-markdown-font-size",
    "--acp-markdown-line-height",
    "--acp-markdown-h1-foreground",
    "--acp-markdown-h2-foreground",
    "--acp-markdown-h3-foreground",
    "--acp-markdown-h4-foreground",
    "--acp-markdown-inline-code-foreground",
    "--acp-markdown-inline-code-border",
] as const;

let currentMarkdownThemeVariables: Readonly<Record<string, string>> | undefined;

function firstNonEmptyCssVar(
    style: CSSStyleDeclaration,
    names: readonly string[],
): string | undefined {
    for (const name of names) {
        const value = style.getPropertyValue(name).trim();
        if (value.length > 0) {
            return value;
        }
    }
    return undefined;
}

function applyThemeVariables(): void {
    const variables = currentMarkdownThemeVariables;
    const root = document.documentElement;
    const computed = getComputedStyle(root);

    for (const name of TEXT_PREFORMAT_VARS) {
        const resolved =
            firstNonEmptyCssVar(computed, [name]) ??
            variables?.[name] ??
            TEXT_PREFORMAT_FALLBACKS[name];
        root.style.setProperty(name, resolved);
    }

    for (const name of MARKDOWN_THEME_VARS) {
        const value = variables?.[name]?.trim();
        if (value !== undefined && value.length > 0) {
            root.style.setProperty(name, value);
        } else {
            root.style.removeProperty(name);
        }
    }
}

/**
 * VS Code webviews may define theme variables as empty strings, which prevents
 * CSS var() fallbacks from applying. Resolve markdown colors explicitly.
 */
export function installAgentMarkdownThemeColors(
    variables?: Readonly<Record<string, string>>,
): () => void {
    currentMarkdownThemeVariables = variables;
    applyThemeVariables();
    const observer = new MutationObserver(() => {
        applyThemeVariables();
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
    });
    return () => {
        observer.disconnect();
        currentMarkdownThemeVariables = undefined;
        for (const name of [...TEXT_PREFORMAT_VARS, ...MARKDOWN_THEME_VARS]) {
            document.documentElement.style.removeProperty(name);
        }
    };
}

export function updateAgentMarkdownThemeColors(
    variables: Readonly<Record<string, string>>,
): void {
    currentMarkdownThemeVariables = variables;
    applyThemeVariables();
}
