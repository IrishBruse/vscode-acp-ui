import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
    buildModelId,
    formatModelDisplayName,
    parseModelIdBracketParams,
} from "./modelVariantPicker";

export type AcpUiConfigSelectChoice = {
    value: string;
    name: string;
    description?: string;
};

export type AcpUiSessionConfigOption =
    | {
          configId: string;
          name: string;
          description?: string;
          category?: string;
          type: "select";
          currentValue: string;
          options: AcpUiConfigSelectChoice[];
      }
    | {
          configId: string;
          name: string;
          description?: string;
          category?: string;
          type: "boolean";
          currentValue: boolean;
      };

export type AcpUiSessionConfigState = {
    options: AcpUiSessionConfigOption[];
};

const DERIVED_CONFIG_PREFIX = "_derived:";

const PARAM_LABELS: Record<string, string> = {
    context: "Context",
    effort: "Effort",
    fast: "Mode",
    thinking: "Mode",
    reasoning: "Reasoning",
    max: "Max mode",
};

const PARAM_VALUE_LABELS: Record<string, Record<string, string>> = {
    fast: { true: "Fast", false: "Thinking" },
    thinking: { true: "Thinking", false: "Standard" },
    effort: {
        low: "Low",
        medium: "Medium",
        high: "High",
        extra_high: "Extra High",
        max: "Max",
    },
    context: {
        "200k": "200K",
        "1m": "1M",
        "272k": "272K",
    },
};

function humanizeParamKey(key: string): string {
    return PARAM_LABELS[key] ?? key.replace(/_/g, " ");
}

function humanizeParamValue(key: string, value: string): string {
    const mapped = PARAM_VALUE_LABELS[key]?.[value.toLowerCase()];
    if (mapped !== undefined) {
        return mapped;
    }
    if (key === "context") {
        return value.toUpperCase();
    }
    return value;
}

function flattenSelectChoices(
    raw: SessionConfigOption & { type: "select" },
): AcpUiConfigSelectChoice[] {
    const choices: AcpUiConfigSelectChoice[] = [];
    for (const entry of raw.options) {
        if ("group" in entry) {
            for (const option of entry.options) {
                choices.push({
                    value: option.value,
                    name: option.name,
                    ...(option.description
                        ? { description: option.description }
                        : {}),
                });
            }
            continue;
        }
        choices.push({
            value: entry.value,
            name: entry.name,
            ...(entry.description ? { description: entry.description } : {}),
        });
    }
    return choices;
}

/**
 * Normalizes agent `SessionConfigOption` rows into a webview-safe shape.
 */
export function sessionConfigOptionsFromAgent(
    raw: ReadonlyArray<SessionConfigOption> | null | undefined,
): AcpUiSessionConfigState | null {
    if (raw === null || raw === undefined || raw.length === 0) {
        return null;
    }
    const options: AcpUiSessionConfigOption[] = [];
    for (const option of raw) {
        if (option.type === "boolean") {
            options.push({
                configId: option.id,
                name: option.name,
                ...(option.description
                    ? { description: option.description }
                    : {}),
                ...(option.category ? { category: option.category } : {}),
                type: "boolean",
                currentValue: option.currentValue,
            });
            continue;
        }
        if (option.type !== "select") {
            continue;
        }
        const choices = flattenSelectChoices(option);
        if (choices.length === 0) {
            continue;
        }
        options.push({
            configId: option.id,
            name: option.name,
            ...(option.description ? { description: option.description } : {}),
            ...(option.category ? { category: option.category } : {}),
            type: "select",
            currentValue: option.currentValue,
            options: choices,
        });
    }
    return options.length > 0 ? { options } : null;
}

export function findSessionConfigOption(
    state: AcpUiSessionConfigState | null,
    configId: string,
): AcpUiSessionConfigOption | undefined {
    return state?.options.find((option) => option.configId === configId);
}

export function modelConfigOption(
    state: AcpUiSessionConfigState | null,
): Extract<AcpUiSessionConfigOption, { type: "select" }> | undefined {
    const option = state?.options.find(
        (row) => row.type === "select" && row.category === "model",
    );
    return option?.type === "select" ? option : undefined;
}

export function modelParameterOptions(
    state: AcpUiSessionConfigState | null,
): AcpUiSessionConfigOption[] {
    if (state === null) {
        return [];
    }
    const explicit = state.options.filter(
        (option) =>
            option.category === "model_config" ||
            option.category === "thought_level",
    );
    if (explicit.length > 0) {
        return explicit;
    }
    return deriveModelParamOptionsFromModelSelect(modelConfigOption(state));
}

/**
 * When the agent only encodes tuning in bracketed model ids, derive per-dimension
 * selectors by scanning all model option values for the active model family.
 */
export function deriveModelParamOptionsFromModelSelect(
    modelOption:
        | Extract<AcpUiSessionConfigOption, { type: "select" }>
        | undefined,
): AcpUiSessionConfigOption[] {
    if (modelOption === undefined) {
        return [];
    }
    const current = parseModelIdBracketParams(modelOption.currentValue);
    const siblings = modelOption.options.filter(
        (choice) =>
            parseModelIdBracketParams(choice.value).base === current.base,
    );
    const variantParams = siblings.map(
        (choice) => parseModelIdBracketParams(choice.value).params,
    );

    const keys = new Set<string>();
    for (const params of variantParams) {
        for (const key of Object.keys(params)) {
            keys.add(key);
        }
    }
    if (/^composer(?:[-.]|$)/.test(current.base) && !keys.has("fast")) {
        keys.add("fast");
    }

    const derived: AcpUiSessionConfigOption[] = [];
    for (const key of [...keys].sort()) {
        const values = new Set<string>();
        for (const params of variantParams) {
            if (params[key] !== undefined) {
                values.add(params[key]);
            }
        }
        if (key === "fast" && values.size === 0) {
            values.add("false");
            values.add("true");
        }
        if (values.size <= 1) {
            continue;
        }
        const options = [...values].sort().map((value) => ({
            value,
            name: humanizeParamValue(key, value),
        }));
        if (key === "fast" && !values.has("false")) {
            options.unshift({ value: "", name: "Default" });
        }
        const currentValue = current.params[key] ?? "";
        derived.push({
            configId: `${DERIVED_CONFIG_PREFIX}${key}`,
            name: humanizeParamKey(key),
            category: "model_config",
            type: "select",
            currentValue,
            options,
        });
    }
    return derived;
}

function paramsSignature(params: Record<string, string>): string {
    const keys = Object.keys(params).sort();
    return JSON.stringify(params, keys);
}

/**
 * Maps a desired model id to an exact value from the agent's advertised model
 * option list. Returns null when no equivalent option exists.
 */
export function resolveAdvertisedModelOptionValue(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    candidateId: string,
): string | null {
    const exact = modelOption.options.find(
        (choice) => choice.value === candidateId,
    );
    if (exact !== undefined) {
        return exact.value;
    }
    const candidate = parseModelIdBracketParams(candidateId);
    const candidateSignature = paramsSignature(candidate.params);
    const paramMatch = modelOption.options.find((choice) => {
        const parsed = parseModelIdBracketParams(choice.value);
        return (
            parsed.base === candidate.base &&
            paramsSignature(parsed.params) === candidateSignature
        );
    });
    return paramMatch?.value ?? null;
}

export function isDerivedConfigId(configId: string): boolean {
    return configId.startsWith(DERIVED_CONFIG_PREFIX);
}

export function derivedParamKeyFromConfigId(configId: string): string {
    return configId.slice(DERIVED_CONFIG_PREFIX.length);
}

/**
 * Applies a derived model-parameter change by composing a new model id and
 * checking it against the agent's advertised model option list.
 */
export function composeModelIdAfterDerivedChange(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    configId: string,
    nextValue: string,
): string | null {
    if (!isDerivedConfigId(configId)) {
        return null;
    }
    const paramKey = derivedParamKeyFromConfigId(configId);
    const current = parseModelIdBracketParams(modelOption.currentValue);
    const nextParams = { ...current.params };
    if (nextValue.length === 0) {
        delete nextParams[paramKey];
    } else {
        nextParams[paramKey] = nextValue;
    }
    const composed = buildModelId(current.base, nextParams);
    return resolveAdvertisedModelOptionValue(modelOption, composed);
}

export function modelChoiceLabel(choice: AcpUiConfigSelectChoice): string {
    return formatModelDisplayName(choice.name, choice.value);
}

export function groupedModelChoices(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
): Array<{ name: string; label: string; value: string }> {
    const seen = new Set<string>();
    const rows: Array<{ name: string; label: string; value: string }> = [];
    for (const choice of modelOption.options) {
        const { base } = parseModelIdBracketParams(choice.value);
        const name = choice.name.trim().length > 0 ? choice.name : base;
        if (seen.has(name)) {
            continue;
        }
        seen.add(name);
        rows.push({
            name,
            label: modelChoiceLabel(choice),
            value: choice.value,
        });
    }
    return rows;
}

export function pickModelOptionForFamily(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    familyName: string,
    preferredParams: Record<string, string>,
): string {
    const familyChoices = modelOption.options.filter((choice) => {
        const name = choice.name.trim();
        const { base } = parseModelIdBracketParams(choice.value);
        return name === familyName || base === familyName;
    });
    if (familyChoices.length === 0) {
        return modelOption.currentValue;
    }
    let best = familyChoices[0];
    let bestScore = -1;
    for (const choice of familyChoices) {
        const params = parseModelIdBracketParams(choice.value).params;
        let score = 0;
        for (const [key, value] of Object.entries(preferredParams)) {
            if (params[key] === value) {
                score += 1;
            }
            if (
                (key === "fast" || key === "max") &&
                value === "true" &&
                params[key] === "true"
            ) {
                score += 1;
            }
            if (
                (key === "fast" || key === "max") &&
                value !== "true" &&
                params[key] === undefined
            ) {
                score += 1;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = choice;
        }
    }
    return best.value;
}
