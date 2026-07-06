import type { SessionModeState } from "@agentclientprotocol/sdk";
import {
    type AcpUiSessionModelSelection,
    sessionModelStateToAcpUiSelection,
} from "./sessionModels";

/**
 * Extracts `result.modes` from a captured ACP NDJSON log (e.g. `standalone/mock/readme.ndjson`).
 */
export function parseSessionModelsFromReadmeNdjson(
    text: string,
): AcpUiSessionModelSelection | null {
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
        const modes = resultRecord.modes;
        if (modes === null || typeof modes !== "object") {
            continue;
        }
        const modeState = modes as SessionModeState;
        if (
            !Array.isArray(modeState.availableModes) ||
            typeof modeState.currentModeId !== "string"
        ) {
            continue;
        }
        return sessionModelStateToAcpUiSelection(modeState);
    }
    return null;
}
