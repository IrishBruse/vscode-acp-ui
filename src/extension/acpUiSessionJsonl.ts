import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
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
    type AcpUiSessionDocument,
    type AcpUiSessionHeader,
    type AcpUiSessionReplayEvent,
    createDebouncedBatchQueue,
    enqueueSessionFileWrite,
    immediateFlushSessionEventTypes,
    normalizePromptHistory,
    parseSessionFile,
    serializeSessionDocument,
    sessionFileBaseNameFromTitle,
    uniqueSessionFileBaseNameFromTitle,
} from "./acpUiSessionJsonlFormat";

export {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionDocument,
    type AcpUiSessionHeader,
    type AcpUiSessionReplayEvent,
    type AcpUiSessionSubmitEvent,
    createDebouncedBatchQueue,
    enqueueSessionFileWrite,
    immediateFlushSessionEventTypes,
    isReplayableSessionEvent,
    parseSessionDocument,
    parseSessionEventLines,
    parseSessionEventLinesFromIndex,
    parseSessionFile,
    parseSessionHeaderBlock,
    parseSessionHeaderLine,
    serializeSessionDocument,
    serializeSessionHeader,
    serializeSessionRecord,
    sessionFileBaseNameFromTitle,
    shouldDeferJsonlHistoryReplay,
    shouldPersistExtensionMessage,
    uniqueSessionFileBaseNameFromTitle,
} from "./acpUiSessionJsonlFormat";

/**
 * Client-owned session files (`acpUi/session/1`) back the chat UI when ACP
 * `session/load` is unavailable or fails.
 * When load succeeds, the log is cleared and agent replay becomes the source of truth.
 */
const sessionsDirectorySettingKey = "ib-acp-ui.sessionsDirectory";
const chatsSubdir = "chats";
const folderLayoutMigrationKey = "acpUi.chats.folderLayoutMigration.v1";

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

/**
 * Per-session directory under the chats root (`chats/<sessionId>/`).
 * The `.acp` transcript file inside is named from the chat title.
 */
export function sessionDirectoryUriForId(
    context: ExtensionContext,
    sessionId: string,
): Uri {
    return Uri.joinPath(resolveSessionsDirectoryUri(context), sessionId);
}

/**
 * Resolves the `.acp` file path for a session id and title.
 */
export function sessionFileUriForId(
    context: ExtensionContext,
    sessionId: string,
    title = "Chat",
): Uri {
    return Uri.joinPath(
        sessionDirectoryUriForId(context, sessionId),
        sessionFileBaseNameFromTitle(title),
    );
}

/** True when the session file sits directly under the chats root (legacy layout). */
export function isFlatSessionFileUri(uri: Uri, sessionsDir: Uri): boolean {
    return dirname(uri.fsPath) === sessionsDir.fsPath;
}

async function listSessionFileNamesInDirectory(dir: Uri): Promise<Set<string>> {
    try {
        const entries = await workspace.fs.readDirectory(dir);
        return new Set(
            entries
                .filter(
                    ([name, fileType]) =>
                        fileType === FileType.File &&
                        name.endsWith(ACP_UI_SESSION_FILE_SUFFIX),
                )
                .map(([name]) => name),
        );
    } catch {
        return new Set();
    }
}

async function resolveSessionFileUriForTitle(
    context: ExtensionContext,
    sessionId: string,
    title: string,
    options?: { excludeUri?: Uri },
): Promise<Uri> {
    const dir = sessionDirectoryUriForId(context, sessionId);
    await workspace.fs.createDirectory(dir);
    const used = await listSessionFileNamesInDirectory(dir);
    const excludeFileName =
        options?.excludeUri !== undefined
            ? basename(options.excludeUri.fsPath)
            : undefined;
    const fileName = uniqueSessionFileBaseNameFromTitle(
        title,
        used,
        excludeFileName,
    );
    return Uri.joinPath(dir, fileName);
}

/**
 * Moves a session file into `chats/<sessionId>/` when it still uses the legacy flat layout.
 */
async function ensureSessionFileInFolder(
    context: ExtensionContext,
    uri: Uri,
    sessionId: string,
): Promise<Uri> {
    const sessionsDir = resolveSessionsDirectoryUri(context);
    const parentName = basename(dirname(uri.fsPath));
    if (!isFlatSessionFileUri(uri, sessionsDir) && parentName === sessionId) {
        return uri;
    }
    const sessionDir = sessionDirectoryUriForId(context, sessionId);
    await workspace.fs.createDirectory(sessionDir);
    const dest = Uri.joinPath(sessionDir, basename(uri.fsPath));
    if (uri.toString() !== dest.toString()) {
        await workspace.fs.rename(uri, dest, { overwrite: false });
    }
    return dest;
}

function sessionFileNamesMatch(current: string, expected: string): boolean {
    return current.toLowerCase() === expected.toLowerCase();
}

/**
 * Renames a session file when its path does not match the chat title.
 * Returns the URI editors should use (unchanged when already correct).
 */
export async function ensureSessionFileNameMatchesTitle(
    context: ExtensionContext,
    uri: Uri,
    title: string,
    sessionId: string,
): Promise<Uri> {
    const inFolder = await ensureSessionFileInFolder(context, uri, sessionId);
    const targetUri = await resolveSessionFileUriForTitle(
        context,
        sessionId,
        title,
        { excludeUri: inFolder },
    );
    const currentName = basename(inFolder.fsPath);
    const targetName = basename(targetUri.fsPath);
    if (sessionFileNamesMatch(currentName, targetName)) {
        return inFolder;
    }
    await workspace.fs.rename(inFolder, targetUri, { overwrite: false });
    return targetUri;
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
    const uri = await resolveSessionFileUriForTitle(
        context,
        header.id,
        header.title,
    );
    const content = serializeSessionDocument({ ...header, history: [] });
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    return { id: header.id, uri, header };
}

const sessionFileAppendDebounceMs = 150;
const sessionFileAppendMaxBatchSize = 48;

const sessionFileAppendQueue = createDebouncedBatchQueue({
    debounceMs: sessionFileAppendDebounceMs,
    maxBatchSize: sessionFileAppendMaxBatchSize,
    onFlush: async (key, batches) => {
        const events: AcpUiSessionReplayEvent[] = [];
        for (const item of batches) {
            try {
                const parsed = JSON.parse(item) as unknown;
                if (
                    parsed !== null &&
                    typeof parsed === "object" &&
                    "type" in parsed
                ) {
                    events.push(parsed as AcpUiSessionReplayEvent);
                }
            } catch {
                // Skip malformed batch entries.
            }
        }
        await appendSessionHistoryEvents(Uri.parse(key), events);
    },
});

async function readSessionDocumentAtUri(
    uri: Uri,
): Promise<AcpUiSessionDocument | null> {
    const doc = await workspace.openTextDocument(uri);
    const parsed = parseSessionFile(doc.getText());
    if (parsed.header === null) {
        return null;
    }
    return { ...parsed.header, history: parsed.events };
}

async function writeSessionDocument(
    uri: Uri,
    document: AcpUiSessionDocument,
): Promise<void> {
    const content = serializeSessionDocument(document);
    await applySessionFileEdit(
        uri,
        (edit, doc) => {
            const fullRange = new Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length),
            );
            edit.replace(uri, fullRange, content);
        },
        `Failed to write session document for ${uri.fsPath}`,
    );
}

async function appendSessionHistoryEvents(
    uri: Uri,
    events: ReadonlyArray<AcpUiSessionReplayEvent>,
): Promise<void> {
    if (events.length === 0) {
        return;
    }
    await enqueueSessionFileWrite(uri.toString(), async () => {
        const current = await readSessionDocumentAtUri(uri);
        if (current === null) {
            throw new Error(`Missing session document at ${uri.fsPath}`);
        }
        await writeSessionDocument(uri, {
            ...current,
            history: [...current.history, ...events],
            updatedAt: Date.now(),
        });
    });
}

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

/**
 * Flushes any debounced session file appends for `uri`.
 */
export async function flushPendingSessionFileWrites(uri: Uri): Promise<void> {
    await sessionFileAppendQueue.flush(uri.toString());
}

/**
 * Clears editor-owned chat history, keeping session metadata.
 */
export async function clearSessionFileLog(
    uri: Uri,
): Promise<AcpUiSessionHeader | null> {
    await flushPendingSessionFileWrites(uri);
    const current = await readSessionDocumentAtUri(uri);
    if (current === null) {
        return null;
    }
    const next: AcpUiSessionDocument = {
        ...current,
        history: [],
        updatedAt: Date.now(),
    };
    await writeSessionDocument(uri, next);
    const { history: _history, ...header } = next;
    return header;
}

/**
 * Appends one replay event to the session document `history` array.
 */
export async function appendSessionEvent(
    uri: Uri,
    event: AcpUiSessionReplayEvent,
): Promise<void> {
    await sessionFileAppendQueue.enqueue(
        uri.toString(),
        JSON.stringify(event),
        immediateFlushSessionEventTypes.has(event.type),
    );
}

/**
 * Appends many replay events in one batched write.
 */
export async function appendSessionEvents(
    uri: Uri,
    events: ReadonlyArray<AcpUiSessionReplayEvent>,
): Promise<void> {
    if (events.length === 0) {
        return;
    }
    const payloads = events.map((event) => JSON.stringify(event));
    await sessionFileAppendQueue.enqueueMany(uri.toString(), payloads, true);
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
    const current = await readSessionDocumentAtUri(uri);
    if (current === null) {
        return null;
    }
    const next: AcpUiSessionDocument = {
        ...current,
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
    await writeSessionDocument(uri, next);
    const { history: _history, ...header } = next;
    return header;
}

/**
 * Deletes a session file from disk.
 */
export async function deleteSessionFile(uri: Uri): Promise<void> {
    await flushPendingSessionFileWrites(uri);
    const sessionDir = Uri.joinPath(uri, "..");
    try {
        await workspace.fs.delete(sessionDir, {
            recursive: true,
            useTrash: true,
        });
    } catch {
        try {
            await workspace.fs.delete(uri, { useTrash: true });
        } catch {
            // File may already be gone.
        }
    }
}

async function readSessionHeaderAtUri(
    uri: Uri,
): Promise<{ header: AcpUiSessionHeader; uri: Uri } | null> {
    try {
        const bytes = await workspace.fs.readFile(uri);
        const parsed = parseSessionFile(Buffer.from(bytes).toString("utf8"));
        if (parsed.header !== null) {
            return { header: parsed.header, uri };
        }
    } catch {
        // Skip unreadable files.
    }
    return null;
}

async function listSessionHeadersInDirectory(
    dir: Uri,
): Promise<Array<{ header: AcpUiSessionHeader; uri: Uri }>> {
    let entries: [string, FileType][];
    try {
        entries = await workspace.fs.readDirectory(dir);
    } catch {
        return [];
    }
    const out: Array<{ header: AcpUiSessionHeader; uri: Uri }> = [];
    for (const [name, fileType] of entries) {
        if (
            fileType === FileType.File &&
            name.endsWith(ACP_UI_SESSION_FILE_SUFFIX)
        ) {
            const row = await readSessionHeaderAtUri(Uri.joinPath(dir, name));
            if (row !== null) {
                out.push(row);
            }
            continue;
        }
        if (fileType !== FileType.Directory) {
            continue;
        }
        const sessionDir = Uri.joinPath(dir, name);
        let sessionEntries: [string, FileType][];
        try {
            sessionEntries = await workspace.fs.readDirectory(sessionDir);
        } catch {
            continue;
        }
        for (const [sessionFileName, sessionFileType] of sessionEntries) {
            if (
                sessionFileType !== FileType.File ||
                !sessionFileName.endsWith(ACP_UI_SESSION_FILE_SUFFIX)
            ) {
                continue;
            }
            const row = await readSessionHeaderAtUri(
                Uri.joinPath(sessionDir, sessionFileName),
            );
            if (row !== null) {
                out.push(row);
            }
        }
    }
    return out;
}

/**
 * Moves legacy flat `chats/*.acp` files into `chats/<sessionId>/<title>.acp`.
 */
export async function migrateFlatSessionFilesToFolderLayout(
    context: ExtensionContext,
): Promise<void> {
    if (context.globalState.get<boolean>(folderLayoutMigrationKey) === true) {
        return;
    }
    const dir = await ensureSessionsDirectory(context);
    let entries: [string, FileType][];
    try {
        entries = await workspace.fs.readDirectory(dir);
    } catch {
        await context.globalState.update(folderLayoutMigrationKey, true);
        return;
    }
    for (const [name, fileType] of entries) {
        if (
            fileType !== FileType.File ||
            !name.endsWith(ACP_UI_SESSION_FILE_SUFFIX)
        ) {
            continue;
        }
        const uri = Uri.joinPath(dir, name);
        const row = await readSessionHeaderAtUri(uri);
        if (row === null) {
            continue;
        }
        try {
            const inFolder = await ensureSessionFileInFolder(
                context,
                uri,
                row.header.id,
            );
            await ensureSessionFileNameMatchesTitle(
                context,
                inFolder,
                row.header.title,
                row.header.id,
            );
        } catch {
            logWarn?.(
                `Failed to migrate chat "${row.header.title}" to folder layout.`,
            );
        }
    }
    await context.globalState.update(folderLayoutMigrationKey, true);
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
    const out = await listSessionHeadersInDirectory(dir);
    out.sort((a, b) => a.header.updatedAt - b.header.updatedAt);
    return out;
}
