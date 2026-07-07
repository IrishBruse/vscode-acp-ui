import type { ExtensionContext, Uri } from "vscode";
import { parseStoredChatItems } from "./acpUiLegacySessions";
import { getAcpUiPromptHistoryEntries } from "./acpUiPromptHistoryMemento";
import {
    createSessionFile,
    deleteSessionFile,
    ensureSessionFileNameMatchesTitle,
    listSessionHeaders,
    migrateFlatSessionFilesToFolderLayout,
    setAcpUiSessionJsonlLogger,
    updateSessionHeader,
} from "./acpUiSessionJsonl";

/**
 * One saved ACP UI session listed in the Chats tree.
 */
export type AcpUiSessionRecord = {
    id: string;
    title: string;
    updatedAt: number;
    agentName?: string;
    /** ACP runtime session id after connect. */
    sessionId?: string;
    uri: Uri;
};

export type { StoredChatItem } from "./acpUiLegacySessions";
export { parseStoredChatItems } from "./acpUiLegacySessions";

const chatsStorageKey = "acpUi.chats.v2";
const legacyGlobalChatsStorageKey = "acpUi.chats.v1";
const migrationDoneKey = "acpUi.chats.jsonlMigration.v1";
const hiddenAgentSessionsKey = "acpUi.hiddenAgentSessions.v1";

type HiddenAgentSessionsState = Record<string, string[]>;

const sessions: AcpUiSessionRecord[] = [];
let activeId: string | null = null;
let extensionContext: ExtensionContext | null = null;
let logWarn: ((message: string) => void) | null = null;

function indexFromHeader(
    header: {
        id: string;
        title: string;
        updatedAt: number;
        agentName?: string;
        runtimeSessionId?: string;
    },
    uri: Uri,
): AcpUiSessionRecord {
    return {
        id: header.id,
        title: header.title,
        updatedAt: header.updatedAt,
        ...(header.agentName !== undefined
            ? { agentName: header.agentName }
            : {}),
        ...(header.runtimeSessionId !== undefined
            ? { sessionId: header.runtimeSessionId }
            : {}),
        uri,
    };
}

async function reloadSessionsFromDisk(): Promise<void> {
    if (extensionContext === null) {
        return;
    }
    const rows = await listSessionHeaders(extensionContext);
    sessions.length = 0;
    sessions.push(
        ...rows.map(({ header, uri }) => indexFromHeader(header, uri)),
    );
    if (activeId !== null && !sessions.some((s) => s.id === activeId)) {
        activeId = sessions[0]?.id ?? null;
    }
}

async function migrateLegacyStorageIfNeeded(): Promise<void> {
    if (extensionContext === null) {
        return;
    }
    const context = extensionContext;
    if (context.globalState.get<boolean>(migrationDoneKey) === true) {
        return;
    }
    const raw = context.workspaceState.get<unknown>(chatsStorageKey);
    const legacyGlobalRaw = context.globalState.get<unknown>(
        legacyGlobalChatsStorageKey,
    );
    const migrated =
        raw === undefined && Array.isArray(legacyGlobalRaw)
            ? legacyGlobalRaw
            : raw;
    const restored = parseStoredChatItems(migrated);
    if (restored === null) {
        await context.globalState.update(migrationDoneKey, true);
        void context.workspaceState.update(chatsStorageKey, undefined);
        void context.globalState.update(legacyGlobalChatsStorageKey, undefined);
        return;
    }
    for (const row of restored) {
        const promptHistory = getAcpUiPromptHistoryEntries(context, row.id);
        try {
            await createSessionFile(context, row.title, {
                id: row.id,
                agentName: row.agentName,
                runtimeSessionId: row.sessionId,
                history: promptHistory,
                createdAt: row.updatedAt,
            });
        } catch {
            logWarn?.(`Failed to migrate legacy chat "${row.title}" to JSONL.`);
        }
    }
    await context.globalState.update(migrationDoneKey, true);
    void context.workspaceState.update(chatsStorageKey, undefined);
    void context.globalState.update(legacyGlobalChatsStorageKey, undefined);
}

/**
 * Initializes in-memory chats from JSONL session files on disk.
 */
export async function initializeAcpUiSessionsStore(
    context: ExtensionContext,
    options?: { log?: (message: string) => void },
): Promise<void> {
    extensionContext = context;
    logWarn = options?.log ?? null;
    setAcpUiSessionJsonlLogger(options?.log);
    sessions.length = 0;
    activeId = null;
    await migrateLegacyStorageIfNeeded();
    await migrateFlatSessionFilesToFolderLayout(context);
    await reloadSessionsFromDisk();
    activeId = sessions[0]?.id ?? null;
}

/**
 * Rescans session files from disk (for example after external changes).
 */
export async function refreshAcpUiSessionsFromDisk(): Promise<void> {
    await reloadSessionsFromDisk();
}

/**
 * Returns sessions in stable insertion order.
 */
export function listAcpUiSessions(): AcpUiSessionRecord[] {
    return [...sessions];
}

/** Sessions for one agent from the local `.acp` index. */
export function listAcpUiSessionsForAgent(
    agentName: string,
): AcpUiSessionRecord[] {
    return sessions.filter((row) => row.agentName === agentName);
}

export function findByRuntimeSessionId(
    agentName: string,
    runtimeSessionId: string,
): AcpUiSessionRecord | undefined {
    return sessions.find(
        (row) =>
            row.agentName === agentName && row.sessionId === runtimeSessionId,
    );
}

export type EnsureLocalSessionInput = {
    agentName: string;
    runtimeSessionId: string;
    title: string;
};

/**
 * Returns an existing local session linked to the agent runtime id, or creates a `.acp` shell.
 */
export async function ensureLocalSessionForAgentSession(
    input: EnsureLocalSessionInput,
): Promise<AcpUiSessionRecord> {
    const existing = findByRuntimeSessionId(
        input.agentName,
        input.runtimeSessionId,
    );
    if (existing !== undefined) {
        return existing;
    }
    if (extensionContext === null) {
        throw new Error("ACP UI sessions store is not initialized.");
    }
    const created = await createSessionFile(extensionContext, input.title, {
        agentName: input.agentName,
        runtimeSessionId: input.runtimeSessionId,
    });
    const record = indexFromHeader(created.header, created.uri);
    sessions.push(record);
    return record;
}

export function getAcpUiSession(id: string): AcpUiSessionRecord | undefined {
    return sessions.find((s) => s.id === id);
}

/**
 * Updates the on-disk path for a session after its `.acp` file is renamed.
 */
export function updateAcpUiSessionFileUri(id: string, uri: Uri): void {
    const row = sessions.find((s) => s.id === id);
    if (row !== undefined) {
        row.uri = uri;
    }
}

/**
 * Returns the session id currently selected in the Chats list, if any.
 */
export function getActiveAcpUiSessionId(): string | null {
    return activeId;
}

/**
 * Marks a session as active for the Chats tree.
 */
export function setActiveAcpUiSessionId(id: string | null): void {
    activeId = id;
}

/**
 * Appends a new session file and returns its record.
 */
export async function addAcpUiSession(
    title: string,
    options?: { agentName?: string },
): Promise<AcpUiSessionRecord> {
    if (extensionContext === null) {
        throw new Error("ACP UI sessions store is not initialized.");
    }
    const created = await createSessionFile(extensionContext, title, {
        agentName: options?.agentName,
    });
    const record = indexFromHeader(created.header, created.uri);
    sessions.push(record);
    return record;
}

/**
 * Removes a session by id and deletes its JSONL file.
 */
export async function removeAcpUiSession(id: string): Promise<void> {
    const row = sessions.find((s) => s.id === id);
    if (row !== undefined && extensionContext !== null) {
        await deleteSessionFile(extensionContext, row.uri);
    }
    const index = sessions.findIndex((s) => s.id === id);
    if (index >= 0) {
        sessions.splice(index, 1);
    }
    if (activeId === id) {
        activeId = sessions[0]?.id ?? null;
    }
}

/**
 * Updates the stored ACP agent name for a session.
 */
export async function setAcpUiSessionAgentName(
    id: string,
    agentName: string,
): Promise<void> {
    const row = sessions.find((s) => s.id === id);
    if (row === undefined) {
        return;
    }
    row.agentName = agentName;
    row.updatedAt = Date.now();
    await updateSessionHeader(row.uri, { agentName, updatedAt: row.updatedAt });
}

/**
 * Stores ACP runtime session id in the session file header.
 */
export async function setAcpUiSessionRuntimeSessionId(
    id: string,
    sessionId: string,
): Promise<void> {
    const row = sessions.find((s) => s.id === id);
    if (row === undefined) {
        return;
    }
    row.sessionId = sessionId;
    row.updatedAt = Date.now();
    await updateSessionHeader(row.uri, {
        runtimeSessionId: sessionId,
        updatedAt: row.updatedAt,
    });
}

/**
 * Removes the stored ACP runtime session id so the next connect uses `session/new`.
 */
export async function clearAcpUiSessionRuntimeSessionId(
    id: string,
): Promise<void> {
    const row = sessions.find((s) => s.id === id);
    if (row === undefined) {
        return;
    }
    delete row.sessionId;
    row.updatedAt = Date.now();
    await updateSessionHeader(row.uri, {
        runtimeSessionId: "",
        updatedAt: row.updatedAt,
    });
}

/**
 * Marks a session as recently used.
 */
export function touchAcpUiSession(id: string): void {
    const row = sessions.find((s) => s.id === id);
    if (row === undefined) {
        return;
    }
    row.updatedAt = Date.now();
}

/**
 * Updates session title in the `.acp` header only (no on-disk file rename).
 * Use for agent-driven `session_info_update` while a chat editor is open.
 */
export async function updateAcpUiSessionTitle(
    id: string,
    nextTitle: string,
): Promise<boolean> {
    const row = sessions.find((s) => s.id === id);
    const title = nextTitle.trim();
    if (row === undefined || title.length === 0) {
        return false;
    }
    if (row.title === title) {
        return true;
    }
    row.title = title;
    row.updatedAt = Date.now();
    await updateSessionHeader(row.uri, { title, updatedAt: row.updatedAt });
    return true;
}

/**
 * Renames a session title in memory and the JSONL header.
 * Returns true when the session exists and a non-empty title was applied.
 */
export async function renameAcpUiSession(
    id: string,
    nextTitle: string,
): Promise<boolean> {
    const row = sessions.find((s) => s.id === id);
    const title = nextTitle.trim();
    if (row === undefined || title.length === 0) {
        return false;
    }
    row.title = title;
    row.updatedAt = Date.now();
    await updateSessionHeader(row.uri, { title, updatedAt: row.updatedAt });
    if (extensionContext !== null) {
        row.uri = await ensureSessionFileNameMatchesTitle(
            extensionContext,
            row.uri,
            title,
            id,
        );
    }
    return true;
}

function readHiddenAgentSessionsState(): HiddenAgentSessionsState {
    if (extensionContext === null) {
        return {};
    }
    const raw = extensionContext.workspaceState.get<unknown>(
        hiddenAgentSessionsKey,
    );
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }
    const state: HiddenAgentSessionsState = {};
    for (const [agentName, ids] of Object.entries(raw)) {
        if (!Array.isArray(ids)) {
            continue;
        }
        const runtimeIds = ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
        );
        if (runtimeIds.length > 0) {
            state[agentName] = runtimeIds;
        }
    }
    return state;
}

/** Runtime session ids the user removed from the Chats tree for one agent. */
export function getHiddenAgentSessionIds(
    agentName: string,
): ReadonlySet<string> {
    const ids = readHiddenAgentSessionsState()[agentName];
    return new Set(ids ?? []);
}

/** Hides an agent session from the Chats tree after the user deletes it. */
export async function hideAgentSession(
    agentName: string,
    runtimeSessionId: string,
): Promise<void> {
    if (extensionContext === null) {
        return;
    }
    const state = readHiddenAgentSessionsState();
    const existing = new Set(state[agentName] ?? []);
    existing.add(runtimeSessionId);
    state[agentName] = [...existing];
    await extensionContext.workspaceState.update(hiddenAgentSessionsKey, state);
}
