import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import { type ExtensionContext, FileType, Uri, workspace } from "vscode";
import {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionDocument,
    enqueueSessionFileWrite,
    normalizeUserMessageHistory,
    parseSessionDocument,
    serializeSessionDocument,
    sessionFileBaseNameFromTitle,
    uniqueSessionFileBaseNameFromTitle,
} from "./acpUiSessionJsonlFormat";

export {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionDocument,
    type AcpUiSessionHeader,
    type AcpUiSessionMetadata,
    enqueueSessionFileWrite,
    normalizeUserMessageHistory,
    parseSessionDocument,
    parseSessionFile,
    parseSessionHeaderBlock,
    parseSessionHeaderLine,
    serializeSessionDocument,
    sessionFileBaseNameFromTitle,
    shouldDeferJsonlHistoryReplay,
    uniqueSessionFileBaseNameFromTitle,
} from "./acpUiSessionJsonlFormat";

/**
 * Client-owned session files (`acpUi/session/1`) store session metadata and
 * composer user message history only. ACP transcript traffic is not persisted here.
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

function buildSessionDocument(
    title: string,
    options?: {
        agentName?: string;
        history?: string[];
        runtimeSessionId?: string;
        id?: string;
        createdAt?: number;
    },
): AcpUiSessionDocument {
    const now = Date.now();
    const history = normalizeUserMessageHistory(options?.history ?? []);
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
        history,
        createdAt: options?.createdAt ?? now,
        updatedAt: now,
    };
}

export async function createSessionFile(
    context: ExtensionContext,
    title: string,
    options?: {
        agentName?: string;
        history?: string[];
        runtimeSessionId?: string;
        id?: string;
        createdAt?: number;
    },
): Promise<{ id: string; uri: Uri; header: AcpUiSessionDocument }> {
    await ensureSessionsDirectory(context);
    const document = buildSessionDocument(title, options);
    const uri = await resolveSessionFileUriForTitle(
        context,
        document.id,
        document.title,
    );
    await persistSessionDocument(uri, document);
    return { id: document.id, uri, header: document };
}

async function readSessionDocumentAtUri(
    uri: Uri,
): Promise<AcpUiSessionDocument | null> {
    try {
        const bytes = await workspace.fs.readFile(uri);
        return parseSessionDocument(Buffer.from(bytes).toString("utf8"));
    } catch {
        return null;
    }
}

async function persistSessionDocument(
    uri: Uri,
    document: AcpUiSessionDocument,
): Promise<void> {
    const content = serializeSessionDocument(document);
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
}

async function mutateSessionDocument(
    uri: Uri,
    apply: (current: AcpUiSessionDocument) => AcpUiSessionDocument,
): Promise<AcpUiSessionDocument | null> {
    return enqueueSessionFileWrite(uri.toString(), async () => {
        const current = await readSessionDocumentAtUri(uri);
        if (current === null) {
            return null;
        }
        const next = apply(current);
        await persistSessionDocument(uri, next);
        return next;
    });
}

/**
 * Persists composer user message history for a session.
 */
export async function updateSessionHistory(
    uri: Uri,
    entries: string[],
): Promise<AcpUiSessionDocument | null> {
    const history = normalizeUserMessageHistory(entries);
    return mutateSessionDocument(uri, (current) => ({
        ...current,
        history,
        updatedAt: Date.now(),
    }));
}

/**
 * Updates session metadata while preserving user message history.
 */
export async function updateSessionHeader(
    uri: Uri,
    patch: Partial<
        Pick<
            AcpUiSessionDocument,
            "title" | "agentName" | "runtimeSessionId" | "history" | "updatedAt"
        >
    >,
): Promise<AcpUiSessionDocument | null> {
    return mutateSessionDocument(uri, (current) => {
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
            ...(patch.history !== undefined
                ? { history: normalizeUserMessageHistory(patch.history) }
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
        return next;
    });
}

export async function deleteSessionFile(uri: Uri): Promise<void> {
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
): Promise<{ header: AcpUiSessionDocument; uri: Uri } | null> {
    const document = await readSessionDocumentAtUri(uri);
    if (document !== null) {
        return { header: document, uri };
    }
    return null;
}

async function listSessionHeadersInDirectory(
    dir: Uri,
): Promise<Array<{ header: AcpUiSessionDocument; uri: Uri }>> {
    let entries: [string, FileType][];
    try {
        entries = await workspace.fs.readDirectory(dir);
    } catch {
        return [];
    }
    const out: Array<{ header: AcpUiSessionDocument; uri: Uri }> = [];
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

export async function listSessionHeaders(
    context: ExtensionContext,
): Promise<Array<{ header: AcpUiSessionDocument; uri: Uri }>> {
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
