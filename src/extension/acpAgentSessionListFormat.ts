import type * as acp from "@agentclientprotocol/sdk";

/** Human-readable label for a `SessionInfo` row in the Chats tree. */
export function sessionInfoLabel(info: acp.SessionInfo): string {
    const title = info.title?.trim();
    if (title !== undefined && title.length > 0) {
        return title;
    }
    const shortId =
        info.sessionId.length > 8 ? info.sessionId.slice(-8) : info.sessionId;
    return `Session ${shortId}`;
}

/** Sort key for `updatedAt` descending (missing dates last). */
export function sessionInfoSortKey(info: acp.SessionInfo): number {
    if (info.updatedAt === undefined || info.updatedAt === null) {
        return 0;
    }
    const parsed = Date.parse(info.updatedAt);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function sortSessionInfos(
    sessions: acp.SessionInfo[],
): acp.SessionInfo[] {
    return [...sessions].sort(
        (a, b) => sessionInfoSortKey(b) - sessionInfoSortKey(a),
    );
}
