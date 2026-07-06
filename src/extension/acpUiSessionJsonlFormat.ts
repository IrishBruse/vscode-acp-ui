export const ACP_UI_SESSION_SCHEMA = "acpUi/session/1" as const;
export const ACP_UI_SESSION_FILE_SUFFIX = ".acp";

const sessionTitleFileNameMaxLength = 120;
const invalidSessionFileNameChars = /[<>:"/\\|?*]/g;
const maxUserMessageHistoryEntries = 55;

function stripControlCharacters(value: string): string {
    let out = "";
    for (const ch of value) {
        const code = ch.charCodeAt(0);
        if (code >= 32) {
            out += ch;
        }
    }
    return out;
}

/**
 * Maps a chat title to a safe `.acp` file name inside a session folder (including suffix).
 */
export function sessionFileBaseNameFromTitle(title: string): string {
    let sanitized = stripControlCharacters(title)
        .trim()
        .replace(invalidSessionFileNameChars, "")
        .replace(/\s+/g, " ")
        .replace(/[. ]+$/g, "");
    if (sanitized.length === 0) {
        sanitized = "Chat";
    }
    if (sanitized.length > sessionTitleFileNameMaxLength) {
        sanitized = sanitized.slice(0, sessionTitleFileNameMaxLength).trim();
    }
    if (sanitized.length === 0) {
        sanitized = "Chat";
    }
    return `${sanitized}${ACP_UI_SESSION_FILE_SUFFIX}`;
}

/**
 * Picks a unique `.acp` file name for `title` among `usedFileNames` in one session folder (case-insensitive).
 */
export function uniqueSessionFileBaseNameFromTitle(
    title: string,
    usedFileNames: ReadonlySet<string>,
    excludeFileName?: string,
): string {
    const excludeKey = excludeFileName?.toLowerCase();
    const reserved = new Set(
        [...usedFileNames]
            .map((name) => name.toLowerCase())
            .filter((name) => name !== excludeKey),
    );
    const first = sessionFileBaseNameFromTitle(title);
    if (!reserved.has(first.toLowerCase())) {
        return first;
    }
    const stem = first.slice(0, -ACP_UI_SESSION_FILE_SUFFIX.length);
    let suffix = 2;
    while (suffix < 10_000) {
        const candidate = `${stem} (${suffix})${ACP_UI_SESSION_FILE_SUFFIX}`;
        if (!reserved.has(candidate.toLowerCase())) {
            return candidate;
        }
        suffix += 1;
    }
    return first;
}

/** Serializes all mutations to one session file so concurrent writes do not race. */
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

/**
 * Session metadata stored in every `.acp` file.
 */
export type AcpUiSessionMetadata = {
    schema: typeof ACP_UI_SESSION_SCHEMA;
    id: string;
    title: string;
    agentName?: string;
    runtimeSessionId?: string;
    createdAt: number;
    updatedAt: number;
};

/**
 * Editor-owned `.acp` document: session metadata plus composer user message history.
 */
export type AcpUiSessionDocument = AcpUiSessionMetadata & {
    history: string[];
};

/** @deprecated Use {@link AcpUiSessionDocument}. */
export type AcpUiSessionHeader = AcpUiSessionDocument;

function metadataFromParsedValue(value: unknown): AcpUiSessionMetadata | null {
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
    return {
        schema: ACP_UI_SESSION_SCHEMA,
        id: row.id,
        title: row.title.trim(),
        ...(agentName !== undefined ? { agentName } : {}),
        ...(runtimeSessionId !== undefined ? { runtimeSessionId } : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * Normalizes composer user message history lines.
 */
export function normalizeUserMessageHistory(entries: unknown): string[] {
    if (!Array.isArray(entries)) {
        return [];
    }
    const out: string[] = [];
    for (const item of entries) {
        if (typeof item === "string" && item.length > 0) {
            out.push(item);
        } else if (
            item !== null &&
            typeof item === "object" &&
            (item as Record<string, unknown>).type === "submit" &&
            typeof (item as Record<string, unknown>).body === "string"
        ) {
            const body = (item as Record<string, unknown>).body as string;
            if (body.length > 0) {
                out.push(body);
            }
        }
        if (out.length >= maxUserMessageHistoryEntries) {
            break;
        }
    }
    return out;
}

function userMessageHistoryFromRow(row: Record<string, unknown>): string[] {
    const fromLegacyPrompt = normalizeUserMessageHistory(row.promptHistory);
    if (fromLegacyPrompt.length > 0) {
        return fromLegacyPrompt;
    }
    if ("history" in row) {
        return normalizeUserMessageHistory(row.history);
    }
    return [];
}

/**
 * Serializes a session document as pretty-printed JSON.
 */
export function serializeSessionDocument(
    document: AcpUiSessionDocument,
): string {
    return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Parses a session document from pretty-printed JSON.
 */
export function parseSessionDocument(
    text: string,
): AcpUiSessionDocument | null {
    const trimmed = text.trim();
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
    const metadata = metadataFromParsedValue(parsed);
    if (metadata === null) {
        return null;
    }
    return {
        ...metadata,
        history: userMessageHistoryFromRow(row),
    };
}

/**
 * Parses a full session file into a document.
 */
export function parseSessionFile(text: string): {
    header: AcpUiSessionDocument | null;
} {
    const document = parseSessionDocument(text);
    return { header: document };
}

/**
 * Parses the session header block (full document for the current format).
 */
export function parseSessionHeaderBlock(text: string): {
    header: AcpUiSessionDocument;
    consumedLines: number;
} | null {
    const document = parseSessionDocument(text);
    if (document === null) {
        return null;
    }
    return {
        header: document,
        consumedLines: text.split(/\r?\n/).length,
    };
}

/**
 * Parses the session header from a single JSON line (legacy).
 */
export function parseSessionHeaderLine(
    line: string,
): AcpUiSessionDocument | null {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("// ")) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    const metadata = metadataFromParsedValue(parsed);
    if (metadata === null) {
        return null;
    }
    const row = parsed as Record<string, unknown>;
    return {
        ...metadata,
        history: userMessageHistoryFromRow(row),
    };
}

/**
 * True when chat open should wait for ACP `session/load` before showing transcript.
 */
export function shouldDeferJsonlHistoryReplay(header: {
    runtimeSessionId?: string;
}): boolean {
    const runtimeSessionId = header.runtimeSessionId?.trim();
    return runtimeSessionId !== undefined && runtimeSessionId.length > 0;
}
