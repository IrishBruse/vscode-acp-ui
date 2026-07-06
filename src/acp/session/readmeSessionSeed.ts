import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { parseSessionModelsFromReadmeNdjson } from "./readmeSessionModels";
import type { AcpUiSessionConfigOption } from "./sessionConfigOptions";
import {
    modelConfigOption,
    sessionConfigOptionsFromAgent,
} from "./sessionConfigOptions";
import type { AcpUiSessionModelSelection } from "./sessionModels";

export type ReadmeSessionSeed = {
    modelSelection: AcpUiSessionModelSelection | null;
    configOptions: AcpUiSessionConfigOption[] | null;
};

function configOptionsFromRaw(raw: unknown): AcpUiSessionConfigOption[] | null {
    if (!Array.isArray(raw) || raw.length === 0) {
        return null;
    }
    const normalized = sessionConfigOptionsFromAgent(
        raw as SessionConfigOption[],
    );
    return normalized?.options ?? null;
}

function modelSelectionFromConfigOptions(
    configOptions: AcpUiSessionConfigOption[] | null,
): AcpUiSessionModelSelection | null {
    if (configOptions === null) {
        return null;
    }
    const modelOption = modelConfigOption({ options: configOptions });
    if (modelOption === undefined) {
        return null;
    }
    return {
        currentModelId: modelOption.currentValue,
        availableModels: modelOption.options.map((choice) => ({
            modelId: choice.value,
            name: choice.name,
        })),
    };
}

function modelSelectionFromRaw(
    raw: unknown,
): AcpUiSessionModelSelection | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const models = raw as {
        currentModelId?: unknown;
        availableModels?: unknown;
    };
    if (
        typeof models.currentModelId !== "string" ||
        !Array.isArray(models.availableModels)
    ) {
        return null;
    }
    const availableModels = models.availableModels
        .filter(
            (row): row is { modelId: string; name: string } =>
                row !== null &&
                typeof row === "object" &&
                typeof (row as { modelId?: unknown }).modelId === "string" &&
                typeof (row as { name?: unknown }).name === "string",
        )
        .map((row) => ({
            modelId: row.modelId,
            name: row.name,
        }));
    if (availableModels.length === 0) {
        return null;
    }
    return {
        currentModelId: models.currentModelId,
        availableModels,
    };
}

/**
 * Extracts bootstrap `models` and `configOptions` from a captured ACP NDJSON log
 * (e.g. `standalone/mock/readme.ndjson`).
 */
export function parseReadmeSessionSeedFromNdjson(
    text: string,
): ReadmeSessionSeed {
    let modelSelection = parseSessionModelsFromReadmeNdjson(text);
    let configOptions: AcpUiSessionConfigOption[] | null = null;

    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        let row: unknown;
        try {
            row = JSON.parse(trimmed) as unknown;
        } catch {
            continue;
        }
        if (row === null || typeof row !== "object") {
            continue;
        }
        const record = row as Record<string, unknown>;
        const result = record.result;
        if (result === null || typeof result !== "object") {
            continue;
        }
        const resultRecord = result as Record<string, unknown>;
        const parsedConfig = configOptionsFromRaw(resultRecord.configOptions);
        if (parsedConfig !== null) {
            configOptions = parsedConfig;
        }
    }

    if (modelSelection === null) {
        modelSelection = modelSelectionFromConfigOptions(configOptions);
    }

    return { modelSelection, configOptions };
}

/**
 * Reads a committed JSON fixture with raw agent `configOptions` and/or `modelSelection`.
 */
export function parseReadmeSessionSeedFromJson(
    text: string,
): ReadmeSessionSeed {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        return { modelSelection: null, configOptions: null };
    }
    if (parsed === null || typeof parsed !== "object") {
        return { modelSelection: null, configOptions: null };
    }
    const record = parsed as Record<string, unknown>;
    const configOptions = configOptionsFromRaw(record.configOptions);
    const modelSelection =
        modelSelectionFromRaw(record.modelSelection) ??
        modelSelectionFromConfigOptions(configOptions);
    return { modelSelection, configOptions };
}
