import type { ToolCallDiffRow } from "../../../src/protocol/extensionHostMessages";
import type { TraceToolItem } from "./chatReducer";

export type ToolKindCounts = {
    read: number;
    search: number;
    edit: number;
    execute: number;
    other: number;
};

export function basenameFromPath(pathText: string): string {
    const trimmed = pathText.trim();
    const normalized = trimmed.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash >= 0 && slash < normalized.length - 1) {
        return normalized.slice(slash + 1);
    }
    return trimmed;
}

export function diffLineStats(
    rows: ToolCallDiffRow[] | undefined,
): { added: number; removed: number } {
    if (rows === undefined || rows.length === 0) {
        return { added: 0, removed: 0 };
    }
    let added = 0;
    let removed = 0;
    for (const row of rows) {
        if (row.kind === "added") {
            added++;
        } else if (row.kind === "removed") {
            removed++;
        }
    }
    return { added, removed };
}

function normalizedKind(item: TraceToolItem): string {
    return item.kind?.toLowerCase() ?? "";
}

function readLineRangeSuffix(item: TraceToolItem): string | null {
    const sources = [item.subtitle ?? "", item.content ?? ""];
    for (const source of sources) {
        const match = source.match(/\blines?\s+(\d+)(?:\s*-\s*(\d+))?/i);
        if (match !== null) {
            const start = match[1];
            const end = match[2];
            if (start !== undefined && end !== undefined) {
                return `lines ${start}-${end}`;
            }
            if (start !== undefined) {
                return `line ${start}`;
            }
        }
    }
    return null;
}

function pathWithoutLineRange(text: string): string {
    return text.replace(/\s+lines?\s+\d+(?:\s*-\s*\d+)?$/i, "").trim();
}

function grepPatternFromText(text: string): string | null {
    const quoted = text.match(/"([^"]+)"/);
    if (quoted?.[1] !== undefined && quoted[1].length > 0) {
        return quoted[1];
    }
    const patternKey = text.match(/(?:pattern|query)\s*[:=]\s*"?([^"\n]+)"?/i);
    if (patternKey?.[1] !== undefined && patternKey[1].trim().length > 0) {
        return patternKey[1].trim();
    }
    return null;
}

function grepPathFromItem(item: TraceToolItem): string {
    const subtitle = item.subtitle?.trim() ?? "";
    const content = item.content?.trim() ?? "";
    const inMatch =
        content.match(/\bin\s+(\S+)/i) ?? subtitle.match(/\bin\s+(\S+)/i);
    if (inMatch?.[1] !== undefined && inMatch[1].length > 0) {
        return inMatch[1];
    }
    if (subtitle.length > 0) {
        return pathWithoutLineRange(subtitle);
    }
    return "";
}

export function countToolKinds(items: TraceToolItem[]): ToolKindCounts {
    const counts: ToolKindCounts = {
        read: 0,
        search: 0,
        edit: 0,
        execute: 0,
        other: 0,
    };
    for (const item of items) {
        const kind = normalizedKind(item);
        if (kind === "read") {
            counts.read++;
        } else if (kind === "search") {
            counts.search++;
        } else if (kind === "edit") {
            counts.edit++;
        } else if (kind === "execute" || kind === "terminal") {
            counts.execute++;
        } else {
            counts.other++;
        }
    }
    return counts;
}

/** One-line summary for a run of consecutive tool calls (for example "Read 3 files, 1 grep"). */
export function compactToolGroupSummary(items: TraceToolItem[]): string {
    if (items.length === 1) {
        return compactToolDetailLine(items[0]!);
    }
    const counts = countToolKinds(items);
    const parts: string[] = [];
    if (counts.read > 0) {
        parts.push(
            counts.read === 1 ? "Read 1 file" : `Read ${counts.read} files`,
        );
    }
    if (counts.search > 0) {
        parts.push(counts.search === 1 ? "1 grep" : `${counts.search} grep`);
    }
    if (counts.edit > 0) {
        parts.push(counts.edit === 1 ? "1 edit" : `${counts.edit} edits`);
    }
    if (counts.execute > 0) {
        parts.push(
            counts.execute === 1
                ? "1 command"
                : `${counts.execute} commands`,
        );
    }
    if (counts.other > 0) {
        parts.push(
            counts.other === 1 ? "1 tool" : `${counts.other} tools`,
        );
    }
    return parts.join(", ");
}

/** Dim detail line for one tool in compact mode. */
export function compactToolDetailLine(item: TraceToolItem): string {
    const kind = normalizedKind(item);
    const subtitle = item.subtitle?.trim() ?? "";

    if (kind === "edit") {
        const path =
            subtitle.length > 0
                ? subtitle
                : (item.content?.split("\n")[0]?.trim() ?? item.title);
        const base = basenameFromPath(path);
        const { added, removed } = diffLineStats(item.diffRows);
        let stats = "";
        if (added > 0) {
            stats += ` +${added}`;
        }
        if (removed > 0) {
            stats += ` -${removed}`;
        }
        return `Edited ${base}${stats}`;
    }

    if (kind === "read") {
        const path =
            subtitle.length > 0
                ? pathWithoutLineRange(subtitle)
                : item.title.trim();
        const lineRange = readLineRangeSuffix(item);
        return lineRange === null ? `Read ${path}` : `Read ${path} ${lineRange}`;
    }

    if (kind === "search") {
        const pattern =
            grepPatternFromText(item.content ?? "") ??
            grepPatternFromText(subtitle) ??
            grepPatternFromText(item.title);
        const path = grepPathFromItem(item);
        if (pattern !== null && path.length > 0) {
            return `Grepped "${pattern}" in ${path}`;
        }
        if (pattern !== null) {
            return `Grepped "${pattern}"`;
        }
        if (path.length > 0) {
            return `Grepped ${path}`;
        }
        const title = item.title.trim();
        return title.length > 0 ? title : "Grep";
    }

    if (kind === "execute" || kind === "terminal") {
        const cmd = subtitle.length > 0 ? subtitle : item.title.trim();
        if (cmd.length === 0) {
            return "Terminal";
        }
        return cmd.startsWith("$") ? cmd : `$ ${cmd}`;
    }

    const title = item.title.trim();
    if (subtitle.length > 0) {
        return `${title} ${subtitle}`.trim();
    }
    return title.length > 0 ? title : "Tool";
}

export function compactToolShowsDiffStats(item: TraceToolItem): boolean {
    return normalizedKind(item) === "edit";
}
