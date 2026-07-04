/** Parsed bracket suffix on Cursor-style model ids, e.g. `model-1[context=200k]`. */
export type ParsedModelId = {
    base: string;
    params: Record<string, string>;
};

export type ModelPickerVariant = {
    modelId: string;
    label: string;
};

export type ModelPickerGroup = {
    /** Stable grouping key (parsed model id base slug). */
    name: string;
    /** Human-readable label for the model family. */
    label: string;
    variants: ModelPickerVariant[];
};

export type ModelPickerState = {
    groups: ModelPickerGroup[];
    currentGroupName: string;
    currentGroupLabel: string;
    currentModelId: string;
};

const VARIANT_PARAM_LABELS: Record<string, Record<string, string>> = {
    fast: { true: "Fast", false: "Standard" },
    thinking: { true: "Thinking", false: "Standard" },
    reasoning: {
        low: "Low reasoning",
        medium: "Medium reasoning",
        high: "High reasoning",
    },
    effort: {
        low: "Low effort",
        medium: "Medium effort",
        high: "High effort",
    },
};

/**
 * Splits `model-1[context=200k,effort=high]` into base name and key/value params.
 * Plain ids without brackets return an empty params map.
 */
export function parseModelIdBracketParams(modelId: string): ParsedModelId {
    const bracketStart = modelId.indexOf("[");
    if (bracketStart === -1) {
        return { base: modelId, params: {} };
    }
    const bracketEnd = modelId.lastIndexOf("]");
    if (bracketEnd <= bracketStart) {
        return { base: modelId, params: {} };
    }
    const base = modelId.slice(0, bracketStart);
    const inner = modelId.slice(bracketStart + 1, bracketEnd).trim();
    const params: Record<string, string> = {};
    if (inner.length === 0) {
        return { base, params };
    }
    for (const part of inner.split(",")) {
        const eq = part.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (key.length > 0) {
            params[key] = value;
        }
    }
    return { base, params };
}

/** Human-readable label for a variant's bracket params. */
export function formatVariantLabel(params: Record<string, string>): string {
    const keys = Object.keys(params);
    if (keys.length === 0) {
        return "Default";
    }
    const parts = keys.sort().map((key) => {
        const value = params[key];
        const mapped = VARIANT_PARAM_LABELS[key]?.[value];
        if (mapped !== undefined) {
            return mapped;
        }
        if (key === "context") {
            return `${value.toUpperCase()} context`;
        }
        return `${key}=${value}`;
    });
    return parts.join(", ");
}

const SLUG_ACRONYMS = new Set(["gpt", "ai"]);

function humanizeSlug(slug: string): string {
    const parts = slug.split(/[-_]/).filter((part) => part.length > 0);
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];
    if (
        parts.length >= 2 &&
        prev !== undefined &&
        last !== undefined &&
        /^\d+$/.test(prev) &&
        /^\d+$/.test(last)
    ) {
        parts.splice(parts.length - 2, 2, `${prev}-${last}`);
    }
    return parts
        .map((part) => {
            const lower = part.toLowerCase();
            if (SLUG_ACRONYMS.has(lower)) {
                return lower.toUpperCase();
            }
            if (/^v?\d+(\.\d+)*$/.test(part) || /^\d+-\d+$/.test(part)) {
                return part;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}

/**
 * Picks a UI label for a model row.
 * Uses the agent `name` when it already looks human-authored, otherwise
 * formats the slug/model id (e.g. `claude-sonnet-4-6` -> `Claude Sonnet 4-6`).
 */
export function formatModelDisplayName(name: string, modelId: string): string {
    const { base } = parseModelIdBracketParams(modelId);
    const raw = name.trim();

    if (
        raw.length > 0 &&
        raw !== modelId &&
        raw !== base &&
        (/\s/.test(raw) ||
            /[()]/.test(raw) ||
            (raw !== raw.toLowerCase() && raw !== raw.toUpperCase()))
    ) {
        return raw;
    }

    const slug = raw.length > 0 ? raw : base;
    if (slug === "default" || slug === "auto") {
        return "Auto";
    }

    return humanizeSlug(slug);
}

/** Rebuilds a Cursor-style model id from a base slug and bracket params. */
export function buildModelId(
    base: string,
    params: Record<string, string>,
): string {
    const keys = Object.keys(params).sort();
    if (keys.length === 0) {
        return `${base}[]`;
    }
    const inner = keys.map((key) => `${key}=${params[key]}`).join(",");
    return `${base}[${inner}]`;
}

/**
 * Groups agent models by parsed id base using only advertised variants.
 */
export function buildModelPickerState(
    availableModels: ReadonlyArray<{ modelId: string; name: string }>,
    currentModelId: string,
): ModelPickerState | null {
    if (availableModels.length === 0) {
        return null;
    }

    const byBase = new Map<
        string,
        {
            displayName: string;
            variants: Array<{
                modelId: string;
                params: Record<string, string>;
            }>;
        }
    >();
    const seenIds = new Set<string>();
    for (const model of availableModels) {
        if (seenIds.has(model.modelId)) {
            continue;
        }
        seenIds.add(model.modelId);
        const { base, params } = parseModelIdBracketParams(model.modelId);
        const existing = byBase.get(base);
        if (existing === undefined) {
            byBase.set(base, {
                displayName: model.name,
                variants: [{ modelId: model.modelId, params }],
            });
            continue;
        }
        existing.variants.push({ modelId: model.modelId, params });
    }

    const groups: ModelPickerGroup[] = [];
    for (const model of availableModels) {
        const { base } = parseModelIdBracketParams(model.modelId);
        if (!byBase.has(base) || groups.some((group) => group.name === base)) {
            continue;
        }
        const bucket = byBase.get(base);
        if (bucket === undefined) {
            continue;
        }
        const sampleModelId = bucket.variants[0]?.modelId ?? model.modelId;
        groups.push({
            name: base,
            label: formatModelDisplayName(bucket.displayName, sampleModelId),
            variants: bucket.variants.map((variant) => ({
                modelId: variant.modelId,
                label: formatVariantLabel(variant.params),
            })),
        });
    }

    const currentEntry =
        availableModels.find((model) => model.modelId === currentModelId) ??
        availableModels[0];
    const currentBase = parseModelIdBracketParams(currentEntry.modelId).base;
    const currentGroup =
        groups.find((group) => group.name === currentBase) ?? null;
    const currentGroupLabel =
        currentGroup?.label ??
        formatModelDisplayName(currentEntry.name, currentEntry.modelId);

    return {
        groups,
        currentGroupName: currentBase,
        currentGroupLabel,
        currentModelId: currentEntry.modelId,
    };
}

/** When switching model family, keep matching tuning params when possible. */
export function pickVariantForGroup(
    variants: ReadonlyArray<{
        modelId: string;
        params: Record<string, string>;
    }>,
    preferredParams: Record<string, string>,
): string {
    if (variants.length === 0) {
        return "";
    }
    if (variants.length === 1) {
        return variants[0].modelId;
    }

    const tunableKeys = ["fast", "thinking", "reasoning", "effort", "context"];
    let best = variants[0];
    let bestScore = -1;
    for (const variant of variants) {
        let score = 0;
        for (const key of tunableKeys) {
            if (key === "fast" || key === "thinking") {
                const wantOn = preferredParams[key] === "true";
                const isOn = variant.params[key] === "true";
                if (wantOn === isOn) {
                    score += 1;
                }
                continue;
            }
            if (
                preferredParams[key] !== undefined &&
                variant.params[key] === preferredParams[key]
            ) {
                score += 1;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = variant;
        }
    }
    return best.modelId;
}
