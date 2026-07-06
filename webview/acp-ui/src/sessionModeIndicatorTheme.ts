const PLAN_COLOR_VARS = [
    "--vscode-editorWarning-foreground",
    "--vscode-charts-orange",
] as const;

/** VS Code default editor warning orange. */
export const PLAN_COLOR_FALLBACK = "#d18616";

type Rgb = readonly [number, number, number];

export function parseCssRgb(color: string): Rgb | undefined {
    const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex !== null) {
        const raw = hex[1];
        if (raw.length === 3) {
            return [
                Number.parseInt(raw[0] + raw[0], 16),
                Number.parseInt(raw[1] + raw[1], 16),
                Number.parseInt(raw[2] + raw[2], 16),
            ] as const;
        }
        return [
            Number.parseInt(raw.slice(0, 2), 16),
            Number.parseInt(raw.slice(2, 4), 16),
            Number.parseInt(raw.slice(4, 6), 16),
        ] as const;
    }

    const rgb = color
        .trim()
        .match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb !== null) {
        return [
            Number(rgb[1]),
            Number(rgb[2]),
            Number(rgb[3]),
        ] as const;
    }
    return undefined;
}

function rgbDistance(a: Rgb, b: Rgb): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Reject theme aliases that resolve to muted gray description text. */
export function isUsablePlanAccentColor(
    color: string,
    descriptionColor: string | undefined,
): boolean {
    const rgb = parseCssRgb(color);
    if (rgb === undefined) {
        return false;
    }

    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation < 0.18) {
        return false;
    }

    if (descriptionColor === undefined) {
        return true;
    }
    const descriptionRgb = parseCssRgb(descriptionColor);
    if (descriptionRgb === undefined) {
        return true;
    }
    return rgbDistance(rgb, descriptionRgb) > 36;
}

function resolveComputedCssColor(varName: string): string | undefined {
    const probe = document.createElement("span");
    probe.style.color = `var(${varName})`;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.documentElement.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    if (color.length === 0 || color === "rgba(0, 0, 0, 0)") {
        return undefined;
    }
    return color;
}

function resolveDescriptionForegroundColor(): string | undefined {
    return resolveComputedCssColor("--vscode-descriptionForeground");
}

export function resolvePlanModeIndicatorColor(
    resolveColor: (varName: string) => string | undefined = resolveComputedCssColor,
    descriptionColor: string | undefined = resolveDescriptionForegroundColor(),
): string {
    for (const varName of PLAN_COLOR_VARS) {
        const resolved = resolveColor(varName);
        if (
            resolved !== undefined &&
            isUsablePlanAccentColor(resolved, descriptionColor)
        ) {
            return resolved;
        }
    }
    return PLAN_COLOR_FALLBACK;
}

function applyPlanModeIndicatorColor(): void {
    document.documentElement.style.setProperty(
        "--acp-composer-plan-foreground",
        resolvePlanModeIndicatorColor(),
    );
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
