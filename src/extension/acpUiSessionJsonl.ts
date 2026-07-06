import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import {
    type ExtensionContext,
    FileType,
    Range,
    type TextDocument,
    Uri,
    WorkspaceEdit,
    workspace,
} from "vscode";
import {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionHeader,
    type AcpUiSessionRecordDebug,
    type AcpUiSessionReplayEvent,
    createDebouncedBatchQueue,
    enqueueSessionFileWrite,
    immediateFlushSessionEventTypes,
    normalizePromptHistory,
    parseSessionFile,
    serializeSessionHeader,
    serializeSessionRecord,
    serializeSessionRpcRecord,
} from "./acpUiSessionJsonlFormat";

export {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionHeader,
    type AcpUiSessionRecordDebug,
    type AcpUiSessionReplayEvent,
    type AcpUiSessionSubmitEvent,
    createDebouncedBatchQueue,
    enqueueSessionFileWrite,
    immediateFlushSessionEventTypes,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionEventLinesFromIndex,
    parseSessionFile,
    parseSessionHeaderLine,
    type SerializeSessionRpcRecordOptions,
    serializeSessionHeader,
    serializeSessionRecord,
    serializeSessionRpcRecord,
    shouldDeferJsonlHistoryReplay,
    shouldPersistExtensionMessage,
} from "./acpUiSessionJsonlFormat";

/**
 * Client-owned transcript files (`acpUi/session/1`) back the chat UI when ACP
 * `session/load` is unavailable or fails.
 * When load succeeds, the log is cleared and agent replay becomes the source of truth.
 */
const sessionsDirectorySettingKey = "ib-acp-ui.sessionsDirectory";
const sessionFilePrettyRpcSettingKey = "ib-acp-ui.sessionFilePrettyRpc";
const chatsSubdir = "chats";

let logWarn: ((message: string) => void) | null = null;

export function setAcpUiSessionJsonlLogger(
    log?: (message: string) => void,
): void {
    logWarn = log ?? null;
}

/**
 * Resolves the directory where chat `.acp` files are stored.
 */
export function resolveSessionsDirectoryUri(context: ExtensionContext): Uri {
    const configured = workspace
        .getConfiguration()
        .get<string>(sessionsDirectorySettingKey, "")
        .trim();
    if (configured.length === 0) {
        return Uri.joinPath(context.globalStorageUri, chatsSubdir);
    }
    if (isAbsolute(configured)) {
        return Uri.file(configured);
    }
    const folder = workspace.workspaceFolders?.[0];
    if (folder === undefined) {
        logWarn?.(
            `ib-acp-ui.sessionsDirectory is workspace-relative ("${configured}") but no folder is open; using extension global storage.`,
        );
        return Uri.joinPath(context.globalStorageUri, chatsSubdir);
    }
    return Uri.joinPath(folder.uri, configured);
}

export function sessionFileUriForId(
    context: ExtensionContext,
    sessionId: string,
): Uri {
    return Uri.joinPath(
        resolveSessionsDirectoryUri(context),
        `${sessionId}${ACP_UI_SESSION_FILE_SUFFIX}`,
    );
}

async function ensureSessionsDirectory(
    context: ExtensionContext,
): Promise<Uri> {
    const dir = resolveSessionsDirectoryUri(context);
    await workspace.fs.createDirectory(dir);
    return dir;
}

function buildSessionHeader(
    title: string,
    options?: {
        agentName?: string;
        promptHistory?: string[];
        runtimeSessionId?: string;
        id?: string;
        createdAt?: number;
    },
): AcpUiSessionHeader {
    const now = Date.now();
    return {
        schema: ACP_UI_SESSION_SCHEMA,
        id: options?.id ?? randomUUID(),
        title: title.trim(),
        ...(options?.agentName !== undefined && options.agentName.length > 0
            ? { agentName: options.agentName }
            : {}),
        ...(options?.runtimeSessionId !== undefined &&
        options.runtimeSessionId.length > 0
            ? { runtimeSessionId: options.runtimeSessionId }
            : {}),
        ...(options?.promptHistory !== undefined &&
        options.promptHistory.length > 0
            ? { promptHistory: options.promptHistory }
            : {}),
        createdAt: options?.createdAt ?? now,
        updatedAt: now,
    };
}

/**
 * Creates a new session file with only a header line.
 */
export async function createSessionFile(
    context: ExtensionContext,
    title: string,
    options?: {
        agentName?: string;
        promptHistory?: string[];
        runtimeSessionId?: string;
        id?: string;
        createdAt?: number;
    },
): Promise<{ id: string; uri: Uri; header: AcpUiSessionHeader }> {
    await ensureSessionsDirectory(context);
    const header = buildSessionHeader(title, options);
    const uri = sessionFileUriForId(context, header.id);
    const content = serializeSessionHeader(header);
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    return { id: header.id, uri, header };
}

const sessionFileAppendDebounceMs = 150;
const sessionFileAppendMaxBatchSize = 48;

const sessionFileAppendQueue = createDebouncedBatchQueue({
    debounceMs: sessionFileAppendDebounceMs,
    maxBatchSize: sessionFileAppendMaxBatchSize,
    onFlush: async (key, blocks) => {
        await appendSessionFileBlocks(Uri.parse(key), blocks);
    },
});

async function applySessionFileEdit(
    uri: Uri,
    apply: (edit: WorkspaceEdit, doc: TextDocument) => void,
    failureMessage: string,
): Promise<void> {
    await enqueueSessionFileWrite(uri.toString(), async () => {
        const doc = await workspace.openTextDocument(uri);
        const edit = new WorkspaceEdit();
        apply(edit, doc);
        const applied = await workspace.applyEdit(edit);
        if (!applied) {
            throw new Error(failureMessage);
        }
        await doc.save();
    });
}

async function appendSessionFileBlocks(
    uri: Uri,
    blocks: string[],
): Promise<void> {
    if (blocks.length === 0) {
        return;
    }
    const combined = blocks.join("");
    await applySessionFileEdit(
        uri,
        (edit, doc) => {
            const text = doc.getText();
            const suffix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
            const insertPos = doc.positionAt(text.length);
            edit.insert(uri, insertPos, `${suffix}${combined}`);
        },
        `Failed to append session records to ${uri.fsPath}`,
    );
}

/**
 * Flushes any debounced session file appends for `uri`.
 */
export async function flushPendingSessionFileWrites(uri: Uri): Promise<void> {
    await sessionFileAppendQueue.flush(uri.toString());
}

/**
 * Removes all replay events and RPC records, keeping only the session header.
 */
export async function clearSessionFileLog(
    uri: Uri,
): Promise<AcpUiSessionHeader | null> {
    await flushPendingSessionFileWrites(uri);
    const doc = await workspace.openTextDocument(uri);
    const parsed = parseSessionFile(doc.getText());
    if (parsed.header === null) {
        return null;
    }
    const content = serializeSessionHeader(parsed.header);
    await enqueueSessionFileWrite(uri.toString(), async () => {
        const latest = await workspace.openTextDocument(uri);
        const edit = new WorkspaceEdit();
        const fullRange = new Range(
            latest.positionAt(0),
            latest.positionAt(latest.getText().length),
        );
        edit.replace(uri, fullRange, content);
        const applied = await workspace.applyEdit(edit);
        if (!applied) {
            throw new Error(`Failed to clear session log for ${uri.fsPath}`);
        }
        await latest.save();
    });
    return parsed.header;
}

/**
 * Appends one replay event block to a session file.
 */
export async function appendSessionEvent(
    uri: Uri,
    event: AcpUiSessionReplayEvent,
    debug?: Partial<AcpUiSessionRecordDebug>,
): Promise<void> {
    const block = serializeSessionRecord(event, {
        record: "event",
        type: event.type,
        ...debug,
    });
    await sessionFileAppendQueue.enqueue(
        uri.toString(),
        block,
        immediateFlushSessionEventTypes.has(event.type),
    );
}

/**
 * Appends many replay event blocks in one batched write.
 */
export async function appendSessionEvents(
    uri: Uri,
    events: ReadonlyArray<AcpUiSessionReplayEvent>,
): Promise<void> {
    if (events.length === 0) {
        return;
    }
    const blocks = events.map((event) =>
        serializeSessionRecord(event, {
            record: "event",
            type: event.type,
        }),
    );
    await sessionFileAppendQueue.enqueueMany(uri.toString(), blocks, true);
}

/**
 * Appends one raw ACP JSON-RPC record to a session file (not replayed in the UI).
 */
export async function appendSessionRpcRecord(
    uri: Uri,
    payload: unknown,
): Promise<void> {
    const pretty = workspace
        .getConfiguration()
        .get<boolean>(sessionFilePrettyRpcSettingKey, false);
    const block = serializeSessionRpcRecord(payload, { pretty });
    await sessionFileAppendQueue.enqueue(uri.toString(), block);
}

/**
 * Replaces line 1 with an updated header.
 */
export async function updateSessionHeader(
    uri: Uri,
    patch: Partial<
        Pick<
            AcpUiSessionHeader,
            | "title"
            | "agentName"
            | "runtimeSessionId"
            | "promptHistory"
            | "updatedAt"
        >
    >,
): Promise<AcpUiSessionHeader | null> {
    await flushPendingSessionFileWrites(uri);
    const doc = await workspace.openTextDocument(uri);
    const parsed = parseSessionFile(doc.getText());
    if (parsed.header === null) {
        return null;
    }
    const next: AcpUiSessionHeader = {
        ...parsed.header,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.agentName !== undefined
            ? patch.agentName.length > 0
                ? { agentName: patch.agentName }
                : {}
            : {}),
        ...(patch.runtimeSessionId !== undefined
            ? patch.runtimeSessionId.length > 0
                ? { runtimeSessionId: patch.runtimeSessionId }
                : {}
            : {}),
        ...(patch.promptHistory !== undefined
            ? patch.promptHistory.length > 0
                ? {
                      promptHistory: normalizePromptHistory(
                          patch.promptHistory,
                      ),
                  }
                : { promptHistory: undefined }
            : {}),
        updatedAt: patch.updatedAt ?? Date.now(),
    };
    if (
        patch.agentName !== undefined &&
        patch.agentName.length === 0 &&
        next.agentName !== undefined
    ) {
        delete next.agentName;
    }
    if (
        patch.runtimeSessionId !== undefined &&
        patch.runtimeSessionId.length === 0 &&
        next.runtimeSessionId !== undefined
    ) {
        delete next.runtimeSessionId;
    }
    if (
        patch.promptHistory !== undefined &&
        (patch.promptHistory.length === 0 || next.promptHistory === undefined)
    ) {
        delete next.promptHistory;
    }
    const firstLine = doc.lineAt(0);
    await applySessionFileEdit(
        uri,
        (edit) => {
            edit.replace(
                uri,
                firstLine.rangeIncludingLineBreak,
                serializeSessionHeader(next),
            );
        },
        `Failed to update session header for ${uri.fsPath}`,
    );
    return next;
}

/**
 * Deletes a session file from disk.
 */
export async function deleteSessionFile(uri: Uri): Promise<void> {
    await flushPendingSessionFileWrites(uri);
    try {
        await workspace.fs.delete(uri, { useTrash: true });
    } catch {
        // File may already be gone.
    }
}

/**
 * Lists session headers by scanning the sessions directory.
 */
export async function listSessionHeaders(
    context: ExtensionContext,
): Promise<Array<{ header: AcpUiSessionHeader; uri: Uri }>> {
    const dir = resolveSessionsDirectoryUri(context);
    try {
        await workspace.fs.createDirectory(dir);
    } catch {
        return [];
    }
    let entries: [string, FileType][];
    try {
        entries = await workspace.fs.readDirectory(dir);
    } catch {
        return [];
    }
    const out: Array<{ header: AcpUiSessionHeader; uri: Uri }> = [];
    for (const [name, fileType] of entries) {
        if (
            fileType !== FileType.File ||
            !name.endsWith(ACP_UI_SESSION_FILE_SUFFIX)
        ) {
            continue;
        }
        const uri = Uri.joinPath(dir, name);
        try {
            const bytes = await workspace.fs.readFile(uri);
            const parsed = parseSessionFile(
                Buffer.from(bytes).toString("utf8"),
            );
            if (parsed.header !== null) {
                out.push({ header: parsed.header, uri });
            }
        } catch {
            // Skip unreadable files.
        }
    }
    out.sort((a, b) => a.header.updatedAt - b.header.updatedAt);
    return out;
}
