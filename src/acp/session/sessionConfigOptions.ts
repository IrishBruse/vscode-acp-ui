import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
    buildModelId,
    formatModelDisplayName,
    parseModelIdBracketParams,
} from "./modelVariantPicker";
import type { AcpUiSessionModelSelection } from "./sessionModels";

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

const BOOLEAN_PARAM_KEYS = new Set(["fast", "thinking"]);

const SKIP_DERIVED_PARAM_KEYS = new Set(["max"]);

const DERIVED_PARAM_ORDER = [
    "context",
    "effort",
    "reasoning",
    "thinking",
    "fast",
] as const;

const PARAM_LABELS: Record<string, string> = {
    context: "Context",
    effort: "Effort",
    thinking: "Thinking",
    reasoning: "Reasoning",
    fast: "Fast",
};

const PARAM_VALUE_LABELS: Record<string, Record<string, string>> = {
    thinking: { true: "Thinking", false: "Standard" },
    fast: { true: "Fast", false: "Standard" },
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

function normalizedParamValue(
    params: Record<string, string>,
    key: string,
): string {
    if (BOOLEAN_PARAM_KEYS.has(key)) {
        return params[key] === "true" ? "true" : "false";
    }
    return params[key] ?? "";
}

function derivedParamSortKey(key: string): number {
    const idx = DERIVED_PARAM_ORDER.indexOf(
        key as (typeof DERIVED_PARAM_ORDER)[number],
    );
    return idx === -1 ? DERIVED_PARAM_ORDER.length : idx;
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

/**
 * Builds a synthetic `category: "model"` select from legacy `session/models`.
 */
export function modelSelectOptionFromModels(
    selection: AcpUiSessionModelSelection,
): Extract<AcpUiSessionConfigOption, { type: "select" }> {
    return {
        configId: "_legacy:model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: selection.currentModelId,
        options: selection.availableModels.map((model) => ({
            value: model.modelId,
            name: model.name,
        })),
    };
}

/**
 * Resolves the model select option from config options or legacy model list.
 */
export function resolveModelSelectOption(
    state: AcpUiSessionConfigState | null,
    modelSelection: AcpUiSessionModelSelection | null,
): Extract<AcpUiSessionConfigOption, { type: "select" }> | undefined {
    const fromConfig = modelConfigOption(state);
    if (fromConfig !== undefined) {
        return fromConfig;
    }
    if (
        modelSelection === null ||
        modelSelection.availableModels.length === 0
    ) {
        return undefined;
    }
    return modelSelectOptionFromModels(modelSelection);
}

export function modelParameterOptions(
    state: AcpUiSessionConfigState | null,
    modelSelection: AcpUiSessionModelSelection | null = null,
): AcpUiSessionConfigOption[] {
    if (state !== null) {
        const explicit = state.options.filter(
            (option) =>
                option.category === "model_config" ||
                option.category === "thought_level",
        );
        if (explicit.length > 0) {
            return explicit;
        }
    }
    const modelOption = resolveModelSelectOption(state, modelSelection);
    return sortModelParameterOptions(
        deriveModelParamOptionsFromModelSelect(modelOption),
    );
}

/**
 * Stable display order for derived model-parameter controls.
 */
export function sortModelParameterOptions(
    options: AcpUiSessionConfigOption[],
): AcpUiSessionConfigOption[] {
    return [...options].sort((a, b) => {
        const aDerived = isDerivedConfigId(a.configId);
        const bDerived = isDerivedConfigId(b.configId);
        if (aDerived && bDerived) {
            return (
                derivedParamSortKey(derivedParamKeyFromConfigId(a.configId)) -
                derivedParamSortKey(derivedParamKeyFromConfigId(b.configId))
            );
        }
        return 0;
    });
}

/**
 * Compact summary for the model-config popover trigger.
 */
export function modelConfigSummaryLabel(
    options: AcpUiSessionConfigOption[],
): string {
    const parts: string[] = [];
    for (const option of options) {
        if (option.type === "boolean") {
            if (option.currentValue) {
                parts.push(option.name);
            }
            continue;
        }
        if (option.currentValue.length === 0) {
            continue;
        }
        const choice = option.options.find(
            (row) => row.value === option.currentValue,
        );
        if (choice !== undefined) {
            parts.push(choice.name);
        }
    }
    return parts.length > 0 ? parts.join(" \u00b7 ") : "Params";
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
            if (SKIP_DERIVED_PARAM_KEYS.has(key)) {
                continue;
            }
            keys.add(key);
        }
    }
    for (const key of BOOLEAN_PARAM_KEYS) {
        const values = new Set(
            variantParams.map((params) => normalizedParamValue(params, key)),
        );
        if (values.size > 1) {
            keys.add(key);
        }
    }

    const derived: AcpUiSessionConfigOption[] = [];
    for (const key of [...keys].sort(
        (a, b) => derivedParamSortKey(a) - derivedParamSortKey(b),
    )) {
        const values = new Set<string>();
        for (const params of variantParams) {
            values.add(normalizedParamValue(params, key));
        }
        if (values.size <= 1) {
            continue;
        }
        if (
            BOOLEAN_PARAM_KEYS.has(key) &&
            [...values].every((value) => value === "true" || value === "false")
        ) {
            derived.push({
                configId: `${DERIVED_CONFIG_PREFIX}${key}`,
                name: humanizeParamKey(key),
                category: "model_config",
                type: "boolean",
                currentValue:
                    normalizedParamValue(current.params, key) === "true",
            });
            continue;
        }
        const options = [...values].sort().map((value) => ({
            value,
            name: humanizeParamValue(key, value),
        }));
        const currentValue = normalizedParamValue(current.params, key);
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

function scoreParamMatch(
    params: Record<string, string>,
    desired: Record<string, string>,
): number {
    let score = 0;
    for (const [key, value] of Object.entries(desired)) {
        if (SKIP_DERIVED_PARAM_KEYS.has(key)) {
            continue;
        }
        if (BOOLEAN_PARAM_KEYS.has(key)) {
            const wantOn = value === "true";
            const isOn = params[key] === "true";
            if (wantOn === isOn) {
                score += 1;
            }
            continue;
        }
        if (params[key] === value) {
            score += 1;
        }
    }
    return score;
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

/**
 * Picks the best advertised sibling when an exact composed id is unavailable.
 */
export function resolveBestAdvertisedModelOption(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    base: string,
    desiredParams: Record<string, string>,
): string | null {
    const composed = buildModelId(base, desiredParams);
    const exact = resolveAdvertisedModelOptionValue(modelOption, composed);
    if (exact !== null) {
        return exact;
    }
    const siblings = modelOption.options.filter(
        (choice) => parseModelIdBracketParams(choice.value).base === base,
    );
    if (siblings.length === 0) {
        return null;
    }
    let best = siblings[0];
    let bestScore = -1;
    for (const choice of siblings) {
        const params = parseModelIdBracketParams(choice.value).params;
        const score = scoreParamMatch(params, desiredParams);
        if (score > bestScore) {
            bestScore = score;
            best = choice;
        }
    }
    return best.value;
}

export function isDerivedConfigId(configId: string): boolean {
    return configId.startsWith(DERIVED_CONFIG_PREFIX);
}

export function derivedParamKeyFromConfigId(configId: string): string {
    return configId.slice(DERIVED_CONFIG_PREFIX.length);
}

function applyParamChange(
    currentParams: Record<string, string>,
    paramKey: string,
    nextValue: string | boolean,
    variantParams: ReadonlyArray<Record<string, string>>,
): Record<string, string> {
    const nextParams = { ...currentParams };
    if (typeof nextValue === "boolean") {
        if (nextValue) {
            nextParams[paramKey] = "true";
        } else {
            const usesExplicitFalse = variantParams.some(
                (params) => params[paramKey] === "false",
            );
            if (usesExplicitFalse) {
                nextParams[paramKey] = "false";
            } else {
                delete nextParams[paramKey];
            }
        }
        return nextParams;
    }
    if (nextValue.length === 0) {
        delete nextParams[paramKey];
    } else {
        nextParams[paramKey] = nextValue;
    }
    return nextParams;
}

/**
 * Applies a derived model-parameter change by composing a new model id and
 * checking it against the agent's advertised model option list.
 */
export function composeModelIdAfterDerivedChange(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    configId: string,
    nextValue: string | boolean,
): string | null {
    if (!isDerivedConfigId(configId)) {
        return null;
    }
    const paramKey = derivedParamKeyFromConfigId(configId);
    const current = parseModelIdBracketParams(modelOption.currentValue);
    const siblings = modelOption.options.filter(
        (choice) =>
            parseModelIdBracketParams(choice.value).base === current.base,
    );
    const variantParams = siblings.map(
        (choice) => parseModelIdBracketParams(choice.value).params,
    );
    const nextParams = applyParamChange(
        current.params,
        paramKey,
        nextValue,
        variantParams,
    );
    return resolveBestAdvertisedModelOption(
        modelOption,
        current.base,
        nextParams,
    );
}

/**
 * Resolves a derived model-parameter pick to an advertised model id.
 */
export function resolveDerivedModelParamPick(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    configId: string,
    value: string | boolean,
): string | null {
    return composeModelIdAfterDerivedChange(modelOption, configId, value);
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
        const score = scoreParamMatch(params, preferredParams);
        if (score > bestScore) {
            bestScore = score;
            best = choice;
        }
    }
    return best.value;
}
