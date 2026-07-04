export type StoredChatItem = {
    id: string;
    title: string;
    agentName: string;
    sessionId: string;
    updatedAt: number;
};

export function parseStoredChatItems(raw: unknown): StoredChatItem[] | null {
    if (!Array.isArray(raw)) {
        return raw === undefined ? [] : null;
    }
    const out: StoredChatItem[] = [];
    for (const item of raw) {
        if (item === null || typeof item !== "object") {
            return null;
        }
        const row = item as Record<string, unknown>;
        if (
            typeof row.id !== "string" ||
            row.id.length === 0 ||
            typeof row.title !== "string" ||
            row.title.trim().length === 0 ||
            typeof row.agentName !== "string" ||
            row.agentName.length === 0 ||
            typeof row.sessionId !== "string" ||
            row.sessionId.length === 0 ||
            typeof row.updatedAt !== "number" ||
            !Number.isFinite(row.updatedAt)
        ) {
            return null;
        }
        out.push({
            id: row.id,
            title: row.title.trim(),
            agentName: row.agentName,
            sessionId: row.sessionId,
            updatedAt: row.updatedAt,
        });
    }
    return out;
}
