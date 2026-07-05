const PLAN_COLOR_VARS = [
    "--vscode-charts-orange",
    "--vscode-editorWarning-foreground",
    "--vscode-terminal-ansiYellow",
] as const;

const PLAN_COLOR_FALLBACK = "#d18616";

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

function applyPlanModeIndicatorColor(): void {
    const root = document.documentElement;
    const planColor =
        firstNonEmptyCssVar(getComputedStyle(root), PLAN_COLOR_VARS) ??
        PLAN_COLOR_FALLBACK;
    root.style.setProperty("--acp-composer-plan-foreground", planColor);
}

/**
 * VS Code webviews may define chart color variables as empty strings, which
 * prevents CSS var() fallbacks from applying. Resolve plan orange explicitly.
 */
export function installSessionModeIndicatorThemeColors(): () => void {
    applyPlanModeIndicatorColor();
    const observer = new MutationObserver(() => {
        applyPlanModeIndicatorColor();
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
    });
    return () => {
        observer.disconnect();
        document.documentElement.style.removeProperty(
            "--acp-composer-plan-foreground",
        );
    };
}
