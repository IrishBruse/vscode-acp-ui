import {
    type AcpUiSessionConfigOption,
    extractModelParamConfigOptions,
    modelParamCacheKey,
} from "./sessionConfigOptions";
import type { AcpUiSessionModelSelection } from "./sessionModels";

const cacheByAgentName = new Map<string, AcpUiSessionConfigOption[]>();
const paramCacheByAgentAndModel = new Map<string, AcpUiSessionConfigOption[]>();
const modelsCacheByAgentName = new Map<string, AcpUiSessionModelSelection>();

function normalizeAgentName(agentName: string): string {
    return agentName.trim();
}

function cloneOptions(
    options: ReadonlyArray<AcpUiSessionConfigOption>,
): AcpUiSessionConfigOption[] {
    return structuredClone(options) as AcpUiSessionConfigOption[];
}

function paramCacheStorageKey(agentName: string, modelKey: string): string {
    return `${normalizeAgentName(agentName)}::${modelKey}`;
}

/** Last advertised config options for an agent (in-memory, per extension host). */
export function readCachedSessionConfigOptions(
    agentName: string,
): AcpUiSessionConfigOption[] | null {
    const key = normalizeAgentName(agentName);
    if (key.length === 0) {
        return null;
    }
    const cached = cacheByAgentName.get(key);
    if (cached === undefined || cached.length === 0) {
        return null;
    }
    return cloneOptions(cached);
}

export function writeCachedSessionConfigOptions(
    agentName: string,
    options: ReadonlyArray<AcpUiSessionConfigOption>,
): void {
    const key = normalizeAgentName(agentName);
    if (key.length === 0 || options.length === 0) {
        return;
    }
    cacheByAgentName.set(key, cloneOptions(options));
    cacheModelParamOptionsFromSession(agentName, options);
}

export function readCachedSessionModels(
    agentName: string,
): AcpUiSessionModelSelection | null {
    const key = normalizeAgentName(agentName);
    if (key.length === 0) {
        return null;
    }
    const cached = modelsCacheByAgentName.get(key);
    if (cached === undefined || cached.availableModels.length === 0) {
        return null;
    }
    return structuredClone(cached) as AcpUiSessionModelSelection;
}

export function writeCachedSessionModels(
    agentName: string,
    selection: AcpUiSessionModelSelection,
): void {
    const key = normalizeAgentName(agentName);
    if (key.length === 0 || selection.availableModels.length === 0) {
        return;
    }
    modelsCacheByAgentName.set(
        key,
        structuredClone(selection) as AcpUiSessionModelSelection,
    );
}

export type CachedComposerSeed = {
    configOptions: AcpUiSessionConfigOption[] | null;
    modelSelection: AcpUiSessionModelSelection | null;
};

/** Cached composer model/config state for instant UI seeding before connect. */
export function readCachedComposerSeed(agentName: string): CachedComposerSeed {
    const configOptions = readCachedSessionConfigOptions(agentName);
    if (configOptions !== null) {
        return { configOptions, modelSelection: null };
    }
    const modelSelection = readCachedSessionModels(agentName);
    return { configOptions: null, modelSelection };
}

export function readCachedModelParamOptions(
    agentName: string,
    modelKey: string,
): AcpUiSessionConfigOption[] | null {
    const agent = normalizeAgentName(agentName);
    const model = modelKey.trim();
    if (agent.length === 0 || model.length === 0) {
        return null;
    }
    const cached = paramCacheByAgentAndModel.get(
        paramCacheStorageKey(agent, model),
    );
    if (cached === undefined || cached.length === 0) {
        return null;
    }
    return cloneOptions(cached);
}

export function writeCachedModelParamOptions(
    agentName: string,
    modelKey: string,
    params: ReadonlyArray<AcpUiSessionConfigOption>,
): void {
    const agent = normalizeAgentName(agentName);
    const model = modelKey.trim();
    if (agent.length === 0 || model.length === 0 || params.length === 0) {
        return;
    }
    paramCacheByAgentAndModel.set(
        paramCacheStorageKey(agent, model),
        cloneOptions(params),
    );
}

export function cacheModelParamOptionsFromSession(
    agentName: string,
    options: ReadonlyArray<AcpUiSessionConfigOption>,
): void {
    const modelOption = options.find(
        (option) => option.type === "select" && option.category === "model",
    );
    if (modelOption?.type !== "select") {
        return;
    }
    const params = extractModelParamConfigOptions(options);
    if (params.length === 0) {
        return;
    }
    writeCachedModelParamOptions(
        agentName,
        modelParamCacheKey(modelOption.currentValue, modelOption),
        params,
    );
}

export function sessionConfigOptionsInReplayEvents(
    events: ReadonlyArray<unknown>,
): boolean {
    return events.some(
        (event) =>
            typeof event === "object" &&
            event !== null &&
            "type" in event &&
            (event as { type: unknown }).type === "sessionConfigOptions",
    );
}
