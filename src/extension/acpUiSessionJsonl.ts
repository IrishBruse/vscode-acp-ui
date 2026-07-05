import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import {
    type ExtensionContext,
    FileType,
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
    normalizePromptHistory,
    parseSessionFile,
    serializeSessionHeader,
    serializeSessionRecord,
} from "./acpUiSessionJsonlFormat";

export {
    ACP_UI_SESSION_FILE_SUFFIX,
    ACP_UI_SESSION_SCHEMA,
    type AcpUiSessionHeader,
    type AcpUiSessionRecordDebug,
    type AcpUiSessionReplayEvent,
    type AcpUiSessionSubmitEvent,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionEventLinesFromIndex,
    parseSessionFile,
    parseSessionHeaderLine,
    serializeSessionHeader,
    serializeSessionRecord,
    shouldPersistExtensionMessage,
} from "./acpUiSessionJsonlFormat";

const sessionsDirectorySettingKey = "ib-acp-ui.sessionsDirectory";
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
    const content = `${serializeSessionHeader(header)}\n`;
    await workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    return { id: header.id, uri, header };
}

async function applySessionFileEdit(
    uri: Uri,
    apply: (edit: WorkspaceEdit, doc: TextDocument) => void,
    failureMessage: string,
): Promise<void> {
    const doc = await workspace.openTextDocument(uri);
    const edit = new WorkspaceEdit();
    apply(edit, doc);
    const applied = await workspace.applyEdit(edit);
    if (!applied) {
        throw new Error(failureMessage);
    }
    await doc.save();
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
    await applySessionFileEdit(
        uri,
        (edit, doc) => {
            const text = doc.getText();
            const suffix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
            const insertPos = doc.positionAt(text.length);
            edit.insert(uri, insertPos, `${suffix}${block}`);
        },
        `Failed to append session event to ${uri.fsPath}`,
    );
}

/**
 * Appends one raw ACP JSON-RPC record to a session file (not replayed in the UI).
 */
export async function appendSessionRpcRecord(
    uri: Uri,
    payload: unknown,
    debug: AcpUiSessionRecordDebug,
): Promise<void> {
    const block = serializeSessionRecord(payload, {
        record: "rpc",
        ...debug,
    });
    await applySessionFileEdit(
        uri,
        (edit, doc) => {
            const text = doc.getText();
            const suffix = text.length > 0 && !text.endsWith("\n") ? "\n" : "";
            const insertPos = doc.positionAt(text.length);
            edit.insert(uri, insertPos, `${suffix}${block}`);
        },
        `Failed to append ACP RPC record to ${uri.fsPath}`,
    );
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
                `${serializeSessionHeader(next)}\n`,
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
