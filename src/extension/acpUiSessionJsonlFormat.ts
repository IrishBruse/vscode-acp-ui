import type { ExtensionToWebviewMessage } from "../protocol/extensionHostMessages";

export const ACP_UI_SESSION_SCHEMA = "acpUi/session/1" as const;
export const ACP_UI_SESSION_FILE_SUFFIX = ".acp";

/**
 * First-line metadata for a chat session file.
 */
export type AcpUiSessionHeader = {
    schema: typeof ACP_UI_SESSION_SCHEMA;
    id: string;
    title: string;
    agentName?: string;
    runtimeSessionId?: string;
    promptHistory?: string[];
    createdAt: number;
    updatedAt: number;
};

/** User turn recorded in the append-only event log. */
export type AcpUiSessionSubmitEvent = { type: "submit"; body: string };

/** Replayable events after the header line. */
export type AcpUiSessionReplayEvent =
    | AcpUiSessionSubmitEvent
    | Exclude<
          ExtensionToWebviewMessage,
          { type: "init" } | { type: "historyReplay" }
      >;

const ephemeralExtensionMessageTypes = new Set<string>([
    "init",
    "historyReplay",
    "permissionRequest",
    "cursorAskQuestionRequest",
    "cursorCreatePlanRequest",
    "error",
]);

function normalizePromptHistory(entries: unknown): string[] | undefined {
    if (!Array.isArray(entries)) {
        return undefined;
    }
    const out: string[] = [];
    for (const item of entries) {
        if (typeof item !== "string" || item.length === 0) {
            continue;
        }
        out.push(item);
        if (out.length >= 55) {
            break;
        }
    }
    return out.length > 0 ? out : undefined;
}

/**
 * True when an extension-to-webview message should be appended to the session log.
 */
export function shouldPersistExtensionMessage(
    message: ExtensionToWebviewMessage,
): boolean {
    if (message.type === "init" || message.type === "historyReplay") {
        return false;
    }
    return !ephemeralExtensionMessageTypes.has(message.type);
}

/**
 * True when a replay event parsed from disk is valid.
 */
export function isReplayableSessionEvent(
    value: unknown,
): value is AcpUiSessionReplayEvent {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const record = value as Record<string, unknown>;
    const messageType = record.type;
    if (typeof messageType !== "string" || messageType.length === 0) {
        return false;
    }
    if (messageType === "submit") {
        return typeof record.body === "string";
    }
    return !ephemeralExtensionMessageTypes.has(messageType);
}

/**
 * Parses the session header from line 1 of a JSONL file.
 */
export function parseSessionHeaderLine(
    line: string,
): AcpUiSessionHeader | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object") {
        return null;
    }
    const row = parsed as Record<string, unknown>;
    if (
        row.schema !== ACP_UI_SESSION_SCHEMA ||
        typeof row.id !== "string" ||
        row.id.length === 0 ||
        typeof row.title !== "string" ||
        row.title.trim().length === 0 ||
        typeof row.createdAt !== "number" ||
        !Number.isFinite(row.createdAt) ||
        typeof row.updatedAt !== "number" ||
        !Number.isFinite(row.updatedAt)
    ) {
        return null;
    }
    const agentName =
        typeof row.agentName === "string" && row.agentName.length > 0
            ? row.agentName
            : undefined;
    const runtimeSessionId =
        typeof row.runtimeSessionId === "string" &&
        row.runtimeSessionId.length > 0
            ? row.runtimeSessionId
            : undefined;
    const promptHistory = normalizePromptHistory(row.promptHistory);
    return {
        schema: ACP_UI_SESSION_SCHEMA,
        id: row.id,
        title: row.title.trim(),
        ...(agentName !== undefined ? { agentName } : {}),
        ...(runtimeSessionId !== undefined ? { runtimeSessionId } : {}),
        ...(promptHistory !== undefined ? { promptHistory } : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * Serializes a session header as a single JSON line (no trailing newline).
 */
export function serializeSessionHeader(header: AcpUiSessionHeader): string {
    return JSON.stringify(header);
}

/**
 * Parses replay events from lines after the header.
 */
export function parseSessionEventLines(
    lines: string[],
): AcpUiSessionReplayEvent[] {
    const out: AcpUiSessionReplayEvent[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            continue;
        }
        if (isReplayableSessionEvent(parsed)) {
            out.push(parsed);
        }
    }
    return out;
}

/**
 * Parses a full session JSONL document into header + replay events.
 */
export function parseSessionFile(text: string): {
    header: AcpUiSessionHeader | null;
    events: AcpUiSessionReplayEvent[];
} {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
        return { header: null, events: [] };
    }
    const header = parseSessionHeaderLine(lines[0] ?? "");
    const events = parseSessionEventLines(lines.slice(1));
    return { header, events };
}

/**
 * Parses only new event lines starting at `fromLineIndex` (0 = header line).
 */
export function parseSessionEventLinesFromIndex(
    text: string,
    fromLineIndex: number,
): AcpUiSessionReplayEvent[] {
    const lines = text.split(/\r?\n/);
    if (fromLineIndex < 1) {
        return parseSessionEventLines(lines.slice(1));
    }
    return parseSessionEventLines(lines.slice(fromLineIndex));
}

export { normalizePromptHistory };
