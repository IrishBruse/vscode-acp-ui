import type { ExtensionToWebviewMessage } from "../protocol/extensionHostMessages";

export const ACP_UI_SESSION_SCHEMA = "acpUi/session/1" as const;
export const ACP_UI_SESSION_FILE_SUFFIX = ".acp";

/** Separator between debug fields on the `//` comment line above each record. */
export const ACP_UI_SESSION_DEBUG_FIELD_SEPARATOR = " | ";

/** Serializes all mutations to one session file so concurrent appends do not race. */
const sessionFileWriteTails = new Map<string, Promise<unknown>>();

/**
 * Runs `operation` after prior writes to the same session file finish.
 */
export function enqueueSessionFileWrite<T>(
    sessionFileKey: string,
    operation: () => Promise<T>,
): Promise<T> {
    const prior =
        sessionFileWriteTails.get(sessionFileKey) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(() => operation());
    sessionFileWriteTails.set(sessionFileKey, next);
    return next as Promise<T>;
}

type DebouncedBatchQueueState = {
    items: string[];
    timer: ReturnType<typeof setTimeout> | undefined;
    waiters: Array<() => void>;
    flushing: Promise<void> | undefined;
};

export type DebouncedBatchQueue = {
    enqueue: (key: string, item: string, immediate?: boolean) => Promise<void>;
    enqueueMany: (
        key: string,
        items: string[],
        immediate?: boolean,
    ) => Promise<void>;
    flush: (key: string) => Promise<void>;
};

/**
 * Batches string appends per key and flushes after a debounce window or size cap.
 */
export function createDebouncedBatchQueue(options: {
    debounceMs: number;
    maxBatchSize: number;
    onFlush: (key: string, items: string[]) => Promise<void>;
}): DebouncedBatchQueue {
    const states = new Map<string, DebouncedBatchQueueState>();

    const getState = (key: string): DebouncedBatchQueueState => {
        let state = states.get(key);
        if (state === undefined) {
            state = {
                items: [],
                timer: undefined,
                waiters: [],
                flushing: undefined,
            };
            states.set(key, state);
        }
        return state;
    };

    const runFlush = async (key: string): Promise<void> => {
        const state = states.get(key);
        if (state === undefined || state.items.length === 0) {
            return;
        }
        if (state.flushing !== undefined) {
            await state.flushing;
            if (state.items.length > 0) {
                await runFlush(key);
            }
            return;
        }

        if (state.timer !== undefined) {
            clearTimeout(state.timer);
            state.timer = undefined;
        }

        const batch = state.items.splice(0);
        const waiters = state.waiters.splice(0);

        state.flushing = options
            .onFlush(key, batch)
            .then(() => undefined)
            .finally(() => {
                state.flushing = undefined;
                for (const resolve of waiters) {
                    resolve();
                }
                if (state.items.length > 0) {
                    void runFlush(key);
                }
            });
        await state.flushing;
    };

    const scheduleFlush = (key: string, immediate: boolean): void => {
        const state = getState(key);
        if (immediate || state.items.length >= options.maxBatchSize) {
            void runFlush(key);
            return;
        }
        if (state.timer !== undefined) {
            clearTimeout(state.timer);
        }
        state.timer = setTimeout(() => {
            state.timer = undefined;
            void runFlush(key);
        }, options.debounceMs);
    };

    return {
        enqueue(key, item, immediate = false) {
            const state = getState(key);
            state.items.push(item);
            return new Promise((resolve) => {
                state.waiters.push(resolve);
                scheduleFlush(key, immediate);
            });
        },
        enqueueMany(key, items, immediate = false) {
            if (items.length === 0) {
                return Promise.resolve();
            }
            const state = getState(key);
            state.items.push(...items);
            return new Promise((resolve) => {
                state.waiters.push(resolve);
                scheduleFlush(
                    key,
                    immediate || items.length >= options.maxBatchSize,
                );
            });
        },
        flush: runFlush,
    };
}

/** Event types that should flush the session append buffer immediately. */
export const immediateFlushSessionEventTypes = new Set<string>([
    "submit",
    "turnComplete",
    "sessionReset",
]);

/**
 * Debug metadata shown on the `//` comment line above each JSON block.
 */
export type AcpUiSessionRecordDebug = {
    record?: "header" | "event" | "rpc";
    type?: string;
    method?: string;
    durationMs?: number;
    direction?: "toAgent" | "fromAgent";
};

/**
 * Builds the pipe-separated debug line shown above each JSON block.
 */
export function formatSessionRecordDebug(
    debug: AcpUiSessionRecordDebug,
): string {
    const parts: string[] = [];
    if (debug.method !== undefined) {
        parts.push(debug.method);
    } else if (debug.record === "header") {
        parts.push("session header");
    } else if (debug.record === "event" && debug.type !== undefined) {
        parts.push(`event ${debug.type}`);
    } else if (debug.record === "rpc") {
        parts.push("rpc");
    }
    if (debug.durationMs !== undefined) {
        parts.push(`${debug.durationMs}ms`);
    }
    if (debug.direction !== undefined) {
        parts.push(debug.direction === "toAgent" ? "to agent" : "from agent");
    }
    if (parts.length === 0) {
        parts.push("record");
    }
    return parts.join(ACP_UI_SESSION_DEBUG_FIELD_SEPARATOR);
}

/**
 * Serializes a value as a `//` debug comment line plus indented JSON.
 */
export function serializeSessionRecord(
    value: unknown,
    debug: AcpUiSessionRecordDebug = {},
): string {
    const debugText = formatSessionRecordDebug(debug);
    const pretty = JSON.stringify(value, null, 2);
    return `// ${debugText}\n${pretty}\n`;
}

/**
 * Parses one session file record starting at `lineIndex`.
 * Supports legacy single-line JSON, legacy per-line comment prefixes, and
 * comment-line + pretty JSON blocks.
 */
export function parseSessionRecordAtLine(
    lines: string[],
    lineIndex: number,
): { value: unknown; consumedLines: number } | null {
    let index = lineIndex;
    while (index < lines.length && lines[index]?.trim() === "") {
        index += 1;
    }
    if (index >= lines.length) {
        return null;
    }

    const first = lines[index]?.trim() ?? "";
    if (first.startsWith("{") || first.startsWith("[")) {
        try {
            return {
                value: JSON.parse(first),
                consumedLines: index - lineIndex + 1,
            };
        } catch {
            return null;
        }
    }

    if (!first.startsWith("// ")) {
        return null;
    }

    const legacyPerLine = parseLegacyPerLineCommentRecord(lines, index);
    if (legacyPerLine !== null) {
        return legacyPerLine;
    }

    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor]?.trim() === "") {
        cursor += 1;
    }

    const jsonParts: string[] = [];
    let depth = 0;
    let started = false;
    while (cursor < lines.length) {
        const trimmed = lines[cursor]?.trim() ?? "";
        if (trimmed.length === 0) {
            if (!started) {
                cursor += 1;
                continue;
            }
            break;
        }
        if (trimmed.startsWith("// ")) {
            break;
        }
        started = true;
        jsonParts.push(lines[cursor] ?? "");
        for (const ch of trimmed) {
            if (ch === "{" || ch === "[") {
                depth += 1;
            } else if (ch === "}" || ch === "]") {
                depth -= 1;
            }
        }
        cursor += 1;
        if (depth <= 0 && started) {
            break;
        }
    }

    if (jsonParts.length === 0) {
        return null;
    }
    try {
        return {
            value: JSON.parse(jsonParts.join("\n")),
            consumedLines: cursor - lineIndex,
        };
    } catch {
        return null;
    }
}

function parseLegacyPerLineCommentRecord(
    lines: string[],
    lineIndex: number,
): { value: unknown; consumedLines: number } | null {
    const separator = ` ${ACP_UI_SESSION_DEBUG_FIELD_SEPARATOR}`;
    const first = lines[lineIndex]?.trim() ?? "";
    const rest = first.slice(3);
    const sepIdx = rest.indexOf(separator);
    if (sepIdx === -1) {
        return null;
    }
    const jsonFragment = rest.slice(sepIdx + separator.length);
    if (!jsonFragment.startsWith("{") && !jsonFragment.startsWith("[")) {
        return null;
    }

    const jsonParts: string[] = [];
    let depth = 0;
    let cursor = lineIndex;
    while (cursor < lines.length) {
        const trimmed = lines[cursor]?.trim() ?? "";
        if (!trimmed.startsWith("// ")) {
            break;
        }
        const lineRest = trimmed.slice(3);
        const lineSepIdx = lineRest.indexOf(separator);
        if (lineSepIdx === -1) {
            break;
        }
        const fragment = lineRest.slice(lineSepIdx + separator.length);
        jsonParts.push(fragment);
        for (const ch of fragment) {
            if (ch === "{" || ch === "[") {
                depth += 1;
            } else if (ch === "}" || ch === "]") {
                depth -= 1;
            }
        }
        cursor += 1;
        if (depth <= 0 && jsonParts.length > 0) {
            break;
        }
    }

    if (jsonParts.length === 0) {
        return null;
    }
    try {
        return {
            value: JSON.parse(jsonParts.join("\n")),
            consumedLines: cursor - lineIndex,
        };
    } catch {
        return null;
    }
}

function headerFromParsedValue(value: unknown): AcpUiSessionHeader | null {
    if (value === null || typeof value !== "object") {
        return null;
    }
    const row = value as Record<string, unknown>;
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
    "sessionConfigOptionsLoading",
    "sessionHistoryLoading",
    "vscodeThemeVariables",
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
 * True when chat open should wait for ACP `session/load` before replaying JSONL.
 * A stored runtime id alone is not enough: agents without `loadSession` still use JSONL.
 */
export function shouldDeferJsonlHistoryReplay(header: {
    runtimeSessionId?: string;
}): boolean {
    const runtimeSessionId = header.runtimeSessionId?.trim();
    return runtimeSessionId !== undefined && runtimeSessionId.length > 0;
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
 * Parses the session header from line 1 of a session file (legacy or pretty JSON).
 */
export function parseSessionHeaderLine(
    line: string,
): AcpUiSessionHeader | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return null;
    }
    if (trimmed.startsWith("// ")) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    return headerFromParsedValue(parsed);
}

/**
 * Serializes a session header as a `//` debug line plus pretty JSON.
 */
export function serializeSessionHeader(header: AcpUiSessionHeader): string {
    return serializeSessionRecord(header, { record: "header" });
}

function parseSessionReplayEventsFromLines(
    lines: string[],
    startLineIndex: number,
): AcpUiSessionReplayEvent[] {
    const out: AcpUiSessionReplayEvent[] = [];
    let index = startLineIndex;
    while (index < lines.length) {
        const record = parseSessionRecordAtLine(lines, index);
        if (record === null) {
            index += 1;
            continue;
        }
        if (isReplayableSessionEvent(record.value)) {
            out.push(record.value);
        }
        index += record.consumedLines;
    }
    return out;
}

/**
 * Parses replay events from lines after the header.
 */
export function parseSessionEventLines(
    lines: string[],
): AcpUiSessionReplayEvent[] {
    return parseSessionReplayEventsFromLines(lines, 0);
}

/**
 * Parses a full session file into header + replay events.
 */
export function parseSessionFile(text: string): {
    header: AcpUiSessionHeader | null;
    events: AcpUiSessionReplayEvent[];
} {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
        return { header: null, events: [] };
    }

    const headerRecord = parseSessionRecordAtLine(lines, 0);
    if (headerRecord === null) {
        return { header: null, events: [] };
    }
    const header = headerFromParsedValue(headerRecord.value);
    const events = parseSessionReplayEventsFromLines(
        lines,
        headerRecord.consumedLines,
    );
    return { header, events };
}

/**
 * Parses only new replay events starting at `fromLineIndex` (0 = header line).
 * Prefer {@link parseSessionFile} and slice by event count when possible.
 */
export function parseSessionEventLinesFromIndex(
    text: string,
    fromLineIndex: number,
): AcpUiSessionReplayEvent[] {
    const lines = text.split(/\r?\n/);
    if (fromLineIndex < 1) {
        const headerRecord = parseSessionRecordAtLine(lines, 0);
        const start = headerRecord !== null ? headerRecord.consumedLines : 1;
        return parseSessionReplayEventsFromLines(lines, start);
    }
    return parseSessionReplayEventsFromLines(lines, fromLineIndex);
}

export { normalizePromptHistory };
