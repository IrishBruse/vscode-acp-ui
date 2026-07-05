import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import {
    buildModelId,
    formatModelDisplayName,
    parseModelIdBracketParams,
} from "./modelVariantPicker";
import { isSessionModeConfigOption } from "./sessionModeIndicator";
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
    fast: { true: "On", false: "Off" },
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

const EXPLICIT_DERIVED_PARAM_ALIASES: Record<string, string> = {
    context_size: "context",
    reasoning_effort: "reasoning",
    fast_mode: "fast",
};

const MODEL_LINE_PARAM_KEYS: Record<string, readonly string[]> = {
    "claude-opus": ["context", "effort", "thinking"],
    "claude-sonnet": ["context", "effort", "thinking"],
    "claude-haiku": ["thinking"],
    composer: ["fast"],
    gpt: ["reasoning"],
};

const LINEAGE_KNOWN_SCALAR_VALUES: Record<string, readonly string[]> = {
    context: ["200k", "1m"],
    effort: ["low", "medium", "high"],
};

const LINES_WITH_KNOWN_SCALAR_FALLBACK = new Set([
    "claude-opus",
    "claude-sonnet",
]);

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

function choiceFamilyName(choice: AcpUiConfigSelectChoice): string {
    const { base } = parseModelIdBracketParams(choice.value);
    const name = choice.name.trim();
    return name.length > 0 ? name : base;
}

function currentFamilyName(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    currentValue: string,
): string {
    const currentChoice = modelOption.options.find(
        (choice) => choice.value === currentValue,
    );
    if (currentChoice !== undefined) {
        return choiceFamilyName(currentChoice);
    }
    return parseModelIdBracketParams(currentValue).base;
}

/**
 * Groups model bases by vendor line (e.g. claude-opus-4-8 -> claude-opus).
 */
export function modelLinePrefix(base: string): string {
    const parts = base.split("-");
    if (parts[0] === "claude" && parts.length >= 2) {
        return `${parts[0]}-${parts[1]}`;
    }
    if (
        parts[0] === "gpt" ||
        parts[0] === "composer" ||
        parts[0] === "gemini"
    ) {
        return parts[0];
    }
    if (parts[0] === "grok") {
        return "grok";
    }
    return parts[0] ?? base;
}

function paramKeyAllowedForLine(linePrefix: string, key: string): boolean {
    return MODEL_LINE_PARAM_KEYS[linePrefix]?.includes(key) === true;
}

/**
 * Collects distinct values for a param key from the active model family only.
 */
function collectFamilyParamValues(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    currentBase: string,
    currentFamilyName: string,
    key: string,
): Set<string> {
    const values = new Set<string>();
    for (const choice of modelOption.options) {
        const parsed = parseModelIdBracketParams(choice.value);
        const family = choiceFamilyName(choice);
        if (parsed.base !== currentBase && family !== currentFamilyName) {
            continue;
        }
        if (BOOLEAN_PARAM_KEYS.has(key)) {
            values.add(normalizedParamValue(parsed.params, key));
            continue;
        }
        if (parsed.params[key] !== undefined) {
            values.add(parsed.params[key]);
        }
    }
    return values;
}

function familyHasFastTrueVariant(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    currentBase: string,
    currentFamilyName: string,
): boolean {
    for (const choice of modelOption.options) {
        const parsed = parseModelIdBracketParams(choice.value);
        const family = choiceFamilyName(choice);
        if (parsed.base !== currentBase && family !== currentFamilyName) {
            continue;
        }
        if (parsed.params.fast === "true") {
            return true;
        }
    }
    return false;
}

function lineageHasThinkingTrueVariant(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    linePrefix: string,
): boolean {
    for (const choice of modelOption.options) {
        const parsed = parseModelIdBracketParams(choice.value);
        if (modelLinePrefix(parsed.base) !== linePrefix) {
            continue;
        }
        if (parsed.params.thinking === "true") {
            return true;
        }
    }
    return false;
}

function collectLineageParamValues(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    linePrefix: string,
    key: string,
): Set<string> {
    const values = new Set<string>();
    for (const choice of modelOption.options) {
        const parsed = parseModelIdBracketParams(choice.value);
        if (modelLinePrefix(parsed.base) !== linePrefix) {
            continue;
        }
        if (BOOLEAN_PARAM_KEYS.has(key)) {
            values.add(normalizedParamValue(parsed.params, key));
            continue;
        }
        if (parsed.params[key] !== undefined) {
            values.add(parsed.params[key]);
        }
    }
    return values;
}

function supplementKnownScalarValues(
    linePrefix: string,
    key: string,
    values: Set<string>,
    currentParams: Record<string, string>,
): Set<string> {
    if (
        BOOLEAN_PARAM_KEYS.has(key) ||
        !LINES_WITH_KNOWN_SCALAR_FALLBACK.has(linePrefix) ||
        !paramKeyAllowedForLine(linePrefix, key) ||
        currentParams[key] === undefined
    ) {
        return values;
    }
    const known = LINEAGE_KNOWN_SCALAR_VALUES[key];
    if (known === undefined) {
        return values;
    }
    const next = new Set(values);
    for (const value of known) {
        next.add(value);
    }
    return next;
}

/**
 * Family-local param values, with lineage pooling and narrow boolean inference
 * when the agent advertises only one bracketed variant per family.
 */
function effectiveFamilyParamValues(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    currentBase: string,
    currentFamilyName: string,
    currentParams: Record<string, string>,
    key: string,
): Set<string> {
    const linePrefix = modelLinePrefix(currentBase);
    let values = collectFamilyParamValues(
        modelOption,
        currentBase,
        currentFamilyName,
        key,
    );
    if (
        !BOOLEAN_PARAM_KEYS.has(key) &&
        paramKeyAllowedForLine(linePrefix, key)
    ) {
        if (values.size <= 1) {
            const lineage = collectLineageParamValues(
                modelOption,
                linePrefix,
                key,
            );
            for (const value of lineage) {
                values.add(value);
            }
        }
        values = supplementKnownScalarValues(
            linePrefix,
            key,
            values,
            currentParams,
        );
    }
    if (values.size > 1) {
        return values;
    }
    if (
        key === "fast" &&
        values.size === 1 &&
        familyHasFastTrueVariant(modelOption, currentBase, currentFamilyName)
    ) {
        return new Set(["false", "true"]);
    }
    if (
        key === "thinking" &&
        values.size === 1 &&
        paramKeyAllowedForLine(linePrefix, "thinking") &&
        (currentParams.thinking === "true" ||
            lineageHasThinkingTrueVariant(modelOption, linePrefix))
    ) {
        return new Set(["false", "true"]);
    }
    return values;
}

function booleanParamSelectOptions(
    key: string,
    values: ReadonlySet<string>,
): AcpUiConfigSelectChoice[] {
    const rows: AcpUiConfigSelectChoice[] = [];
    if (values.has("false")) {
        rows.push({
            value: "false",
            name: humanizeParamValue(key, "false"),
        });
    }
    if (values.has("true")) {
        rows.push({
            value: "true",
            name: humanizeParamValue(key, "true"),
        });
    }
    return rows;
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

export function modeConfigOption(
    state: AcpUiSessionConfigState | null,
): Extract<AcpUiSessionConfigOption, { type: "select" }> | undefined {
    const byCategory = state?.options.find(
        (row) => row.type === "select" && row.category === "mode",
    );
    if (byCategory?.type === "select") {
        return byCategory;
    }
    const byId = state?.options.find(
        (row) => row.type === "select" && row.configId === "mode",
    );
    return byId?.type === "select" ? byId : undefined;
}

/**
 * Next value when cycling a select config option forward (wraps at the end).
 */
export function nextCycledConfigSelectValue(
    option: Extract<AcpUiSessionConfigOption, { type: "select" }>,
): string | null {
    if (option.options.length <= 1) {
        return null;
    }
    const currentIndex = option.options.findIndex(
        (choice) => choice.value === option.currentValue,
    );
    const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % option.options.length;
    const nextChoice = option.options[nextIndex];
    return nextChoice?.value ?? null;
}

/** Resolves the next session mode for Shift+Tab cycling, if one is advertised. */
export function cycleSessionModePick(
    state: AcpUiSessionConfigState | null,
): { configId: string; value: string } | null {
    const modeOption = modeConfigOption(state);
    if (modeOption === undefined) {
        return null;
    }
    const nextValue = nextCycledConfigSelectValue(modeOption);
    if (nextValue === null) {
        return null;
    }
    return { configId: modeOption.configId, value: nextValue };
}

/**
 * True when the agent advertises separate config options (mode, model_config, etc.)
 * instead of encoding all tuning in bracketed model ids. Matches Zed's layout.
 */
export function usesAgentOrderedConfigLayout(
    state: AcpUiSessionConfigState | null,
): boolean {
    if (state === null || state.options.length === 0) {
        return false;
    }
    const hasNonModelCategory = state.options.some(
        (option) =>
            option.category !== undefined && option.category !== "model",
    );
    if (hasNonModelCategory) {
        return true;
    }
    const modelOption = modelConfigOption(state);
    if (modelOption === undefined) {
        return true;
    }
    return !modelOption.options.some((choice) => choice.value.includes("["));
}

/** Human-readable label for the active value of a config option control. */
export function configOptionDisplayValue(
    option: AcpUiSessionConfigOption,
): string {
    if (option.type === "boolean") {
        return option.currentValue ? "On" : "Off";
    }
    const choice = option.options.find(
        (row) => row.value === option.currentValue,
    );
    if (choice !== undefined) {
        return choice.name;
    }
    if (option.currentValue.length === 0) {
        return option.name;
    }
    return option.currentValue;
}

/** Summary of active config values for the locked composer label. */
export function configOptionsSummaryLabel(
    options: ReadonlyArray<AcpUiSessionConfigOption>,
): string {
    const parts = options
        .filter((option) => !isSessionModeConfigOption(option))
        .map((option) => configOptionDisplayValue(option))
        .filter((label) => label.length > 0);
    return parts.length > 0 ? parts.join(" \u00b7 ") : "\u2014";
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
    const explicit =
        state?.options.filter(
            (option) =>
                option.category === "model_config" ||
                option.category === "thought_level",
        ) ?? [];
    const modelOption = resolveModelSelectOption(state, modelSelection);
    const derived = deriveModelParamOptionsFromModelSelect(modelOption);
    if (explicit.length === 0) {
        return sortModelParameterOptions(derived);
    }
    const coveredKeys = new Set<string>();
    for (const option of explicit) {
        const alias = EXPLICIT_DERIVED_PARAM_ALIASES[option.configId];
        if (alias !== undefined) {
            coveredKeys.add(alias);
        }
    }
    const merged = [
        ...explicit,
        ...derived.filter((option) => {
            if (!isDerivedConfigId(option.configId)) {
                return true;
            }
            return !coveredKeys.has(
                derivedParamKeyFromConfigId(option.configId),
            );
        }),
    ];
    return sortModelParameterOptions(merged);
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
    const familyName = currentFamilyName(modelOption, modelOption.currentValue);
    const siblings = modelOption.options.filter(
        (choice) =>
            parseModelIdBracketParams(choice.value).base === current.base ||
            choiceFamilyName(choice) === familyName,
    );
    const variantParams = siblings.map(
        (choice) => parseModelIdBracketParams(choice.value).params,
    );

    const keys = new Set<string>();
    const linePrefix = modelLinePrefix(current.base);
    for (const params of variantParams) {
        for (const key of Object.keys(params)) {
            if (!SKIP_DERIVED_PARAM_KEYS.has(key)) {
                keys.add(key);
            }
        }
    }
    for (const key of MODEL_LINE_PARAM_KEYS[linePrefix] ?? []) {
        if (
            !SKIP_DERIVED_PARAM_KEYS.has(key) &&
            (current.params[key] !== undefined || BOOLEAN_PARAM_KEYS.has(key))
        ) {
            keys.add(key);
        }
    }
    for (const key of BOOLEAN_PARAM_KEYS) {
        const values = effectiveFamilyParamValues(
            modelOption,
            current.base,
            familyName,
            current.params,
            key,
        );
        if (values.size > 1) {
            keys.add(key);
        }
    }

    const derived: AcpUiSessionConfigOption[] = [];
    for (const key of [...keys].sort(
        (a, b) => derivedParamSortKey(a) - derivedParamSortKey(b),
    )) {
        if (!paramKeyAllowedForLine(linePrefix, key)) {
            const familyOnly = collectFamilyParamValues(
                modelOption,
                current.base,
                familyName,
                key,
            );
            if (familyOnly.size <= 1) {
                continue;
            }
        }
        const values = effectiveFamilyParamValues(
            modelOption,
            current.base,
            familyName,
            current.params,
            key,
        );
        if (values.size <= 1) {
            continue;
        }
        if (
            BOOLEAN_PARAM_KEYS.has(key) &&
            [...values].every((value) => value === "true" || value === "false")
        ) {
            const options = booleanParamSelectOptions(key, values);
            derived.push({
                configId: `${DERIVED_CONFIG_PREFIX}${key}`,
                name: humanizeParamKey(key),
                category: "model_config",
                type: "select",
                currentValue: normalizedParamValue(current.params, key),
                options,
            });
            continue;
        }
        const options = [...values].sort().map((value) => ({
            value,
            name: humanizeParamValue(key, value),
        }));
        const currentValue = BOOLEAN_PARAM_KEYS.has(key)
            ? normalizedParamValue(current.params, key)
            : (current.params[key] ?? "");
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

/**
 * Resolves a model id for wire calls: exact advertised match, best sibling when
 * it fully matches the requested params, otherwise the composed id.
 */
export function resolveModelConfigWireValue(
    modelOption: Extract<AcpUiSessionConfigOption, { type: "select" }>,
    candidateId: string,
): string {
    const advertised = resolveAdvertisedModelOptionValue(
        modelOption,
        candidateId,
    );
    if (advertised !== null) {
        return advertised;
    }
    const candidate = parseModelIdBracketParams(candidateId);
    const best = resolveBestAdvertisedModelOption(
        modelOption,
        candidate.base,
        candidate.params,
    );
    if (best !== null) {
        const bestParams = parseModelIdBracketParams(best).params;
        if (paramsSignature(bestParams) === paramsSignature(candidate.params)) {
            return best;
        }
        let fullMatch = true;
        for (const [key, value] of Object.entries(candidate.params)) {
            if (BOOLEAN_PARAM_KEYS.has(key)) {
                const wantOn = value === "true";
                const isOn = bestParams[key] === "true";
                if (wantOn !== isOn) {
                    fullMatch = false;
                }
                continue;
            }
            if (bestParams[key] !== value) {
                fullMatch = false;
            }
        }
        if (fullMatch) {
            for (const key of BOOLEAN_PARAM_KEYS) {
                if (
                    bestParams[key] === "true" &&
                    candidate.params[key] !== "true"
                ) {
                    fullMatch = false;
                }
            }
        }
        if (fullMatch) {
            return best;
        }
    }
    return candidateId;
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
    const familyName = currentFamilyName(modelOption, modelOption.currentValue);
    const siblings = modelOption.options.filter(
        (choice) =>
            parseModelIdBracketParams(choice.value).base === current.base ||
            choiceFamilyName(choice) === familyName,
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
    return resolveModelConfigWireValue(
        modelOption,
        buildModelId(current.base, nextParams),
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
