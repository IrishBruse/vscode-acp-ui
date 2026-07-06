import type { ToolCallDiffRow } from "../../../src/protocol/extensionHostMessages";
import type { TraceToolItem } from "./chatReducer";

export type ToolKindCounts = {
    read: number;
    search: number;
    glob: number;
    edit: number;
    execute: number;
    other: number;
};

export type CompactToolDetailParts = {
    verb: string;
    detail: string;
};

export type CompactGroupSummaryParts = {
    verbs: string;
    counts: string;
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

function isGlobTool(item: TraceToolItem): boolean {
    const kind = normalizedKind(item);
    if (kind === "glob") {
        return true;
    }
    return item.title.toLowerCase().includes("glob");
}

function isSearchTool(item: TraceToolItem): boolean {
    const kind = normalizedKind(item);
    if (kind === "search") {
        return true;
    }
    const title = item.title.toLowerCase();
    return title.includes("grep") || title.includes("search");
}

function pluralCount(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
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

function globPatternFromItem(item: TraceToolItem): string | null {
    const sources = [item.content ?? "", item.subtitle ?? "", item.title];
    for (const source of sources) {
        const pattern = grepPatternFromText(source);
        if (pattern !== null) {
            return pattern;
        }
    }
    return null;
}

function globScopeFromItem(item: TraceToolItem): string {
    const subtitle = item.subtitle?.trim() ?? "";
    const content = item.content?.trim() ?? "";
    const inMatch =
        content.match(/\bin\s+(\S+)/i) ?? subtitle.match(/\bin\s+(\S+)/i);
    if (inMatch?.[1] !== undefined && inMatch[1].length > 0) {
        return inMatch[1];
    }
    if (subtitle.length > 0 && !subtitle.includes('"')) {
        return subtitle;
    }
    return ".";
}

export function countToolKinds(items: TraceToolItem[]): ToolKindCounts {
    const counts: ToolKindCounts = {
        read: 0,
        search: 0,
        glob: 0,
        edit: 0,
        execute: 0,
        other: 0,
    };
    for (const item of items) {
        if (isGlobTool(item)) {
            counts.glob++;
            continue;
        }
        if (isSearchTool(item)) {
            counts.search++;
            continue;
        }
        const kind = normalizedKind(item);
        if (kind === "read") {
            counts.read++;
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

/** Bold verb list plus dim counts for a grouped compact summary. */
export function compactToolGroupSummaryParts(
    items: TraceToolItem[],
): CompactGroupSummaryParts | null {
    if (items.length <= 1) {
        return null;
    }
    const counts = countToolKinds(items);
    const verbs: string[] = [];
    const countParts: string[] = [];
    if (counts.search > 0) {
        verbs.push("Grepped");
        countParts.push(pluralCount(counts.search, "grep", "greps"));
    }
    if (counts.glob > 0) {
        verbs.push("Globbed");
        countParts.push(pluralCount(counts.glob, "glob", "globs"));
    }
    if (counts.read > 0) {
        verbs.push("read");
        countParts.push(pluralCount(counts.read, "file", "files"));
    }
    if (counts.edit > 0) {
        verbs.push("Edited");
        countParts.push(pluralCount(counts.edit, "edit", "edits"));
    }
    if (counts.execute > 0) {
        verbs.push("Ran");
        countParts.push(pluralCount(counts.execute, "command", "commands"));
    }
    if (counts.other > 0) {
        verbs.push("Used tools");
        countParts.push(pluralCount(counts.other, "tool", "tools"));
    }
    if (verbs.length === 0) {
        return null;
    }
    return { verbs: verbs.join(", "), counts: countParts.join(", ") };
}

/** One-line summary for a run of consecutive tool calls. */
export function compactToolGroupSummary(items: TraceToolItem[]): string {
    if (items.length === 1) {
        return compactToolDetailLine(items[0]!);
    }
    const parts = compactToolGroupSummaryParts(items);
    if (parts === null) {
        return "";
    }
    return `${parts.verbs} ${parts.counts}`;
}

/** Verb (dim) and detail (bright) for one compact tool line. */
export function compactToolDetailParts(
    item: TraceToolItem,
): CompactToolDetailParts {
    const kind = normalizedKind(item);
    const subtitle = item.subtitle?.trim() ?? "";

    if (kind === "edit") {
        const path =
            subtitle.length > 0
                ? subtitle
                : (item.content?.split("\n")[0]?.trim() ?? item.title);
        return { verb: "Edited", detail: basenameFromPath(path) };
    }

    if (kind === "read") {
        const path =
            subtitle.length > 0
                ? pathWithoutLineRange(subtitle)
                : item.title.trim();
        const lineRange = readLineRangeSuffix(item);
        const detail =
            lineRange === null ? path : `${path} ${lineRange}`;
        return { verb: "Read", detail };
    }

    if (isGlobTool(item)) {
        const pattern = globPatternFromItem(item);
        const scope = globScopeFromItem(item);
        if (pattern !== null) {
            return {
                verb: "Globbed",
                detail: `"${pattern}" in ${scope}`,
            };
        }
        if (scope.length > 0) {
            return { verb: "Globbed", detail: scope };
        }
        return { verb: "Globbed", detail: "" };
    }

    if (isSearchTool(item)) {
        const pattern =
            grepPatternFromText(item.content ?? "") ??
            grepPatternFromText(subtitle) ??
            grepPatternFromText(item.title);
        const path = grepPathFromItem(item);
        if (pattern !== null && path.length > 0) {
            return {
                verb: "Grepped",
                detail: `"${pattern}" in ${path}`,
            };
        }
        if (pattern !== null) {
            return { verb: "Grepped", detail: `"${pattern}"` };
        }
        if (path.length > 0) {
            return { verb: "Grepped", detail: path };
        }
        return { verb: "Grepped", detail: "" };
    }

    if (kind === "execute" || kind === "terminal") {
        const cmd = subtitle.length > 0 ? subtitle : item.title.trim();
        if (cmd.length === 0) {
            return { verb: "Ran", detail: "" };
        }
        return {
            verb: "Ran",
            detail: cmd.startsWith("$") ? cmd.slice(1).trimStart() : cmd,
        };
    }

    const title = item.title.trim();
    if (subtitle.length > 0) {
        return { verb: title.length > 0 ? title : "Tool", detail: subtitle };
    }
    return { verb: title.length > 0 ? title : "Tool", detail: "" };
}

/** Full compact line text (verb + detail). */
export function compactToolDetailLine(item: TraceToolItem): string {
    const { verb, detail } = compactToolDetailParts(item);
    const kind = normalizedKind(item);

    if (kind === "edit") {
        const { added, removed } = diffLineStats(item.diffRows);
        let stats = "";
        if (added > 0) {
            stats += ` +${added}`;
        }
        if (removed > 0) {
            stats += ` -${removed}`;
        }
        return detail.length > 0
            ? `${verb} ${detail}${stats}`
            : `${verb}${stats}`;
    }

    if (kind === "execute" || kind === "terminal") {
        if (detail.length === 0) {
            return "Terminal";
        }
        return detail.startsWith("$") ? detail : `$ ${detail}`;
    }

    return detail.length > 0 ? `${verb} ${detail}` : verb;
}

export function compactToolShowsDiffStats(item: TraceToolItem): boolean {
    return normalizedKind(item) === "edit";
}

export const compactExecutePreviewLineCount = 3;

export function isExecuteTool(item: TraceToolItem): boolean {
    const kind = normalizedKind(item);
    return kind === "execute" || kind === "terminal";
}

/** Execute/terminal tools render on their own in compact mode (never grouped). */
export function isCompactGroupableTool(item: TraceToolItem): boolean {
    return !isExecuteTool(item);
}

export function executeCommandText(item: TraceToolItem): string {
    const { detail } = compactToolDetailParts(item);
    return detail;
}

/** Terminal output lines with a leading echoed command line stripped when present. */
export function executeOutputContentLines(item: TraceToolItem): string[] {
    const content = item.content?.trim();
    if (content === undefined || content.length === 0) {
        return [];
    }
    let normalized = content.replace(/\r\n/g, "\n");
    if (normalized.endsWith("\n")) {
        normalized = normalized.slice(0, -1);
    }
    if (normalized === "") {
        return [];
    }
    const lines = normalized.split("\n");
    const cmd = executeCommandText(item);
    if (cmd.length === 0) {
        return lines;
    }
    const first = lines[0]?.trim() ?? "";
    if (first === `$ ${cmd}`.trim() || first === cmd.trim()) {
        return lines.slice(1);
    }
    return lines;
}

export function executeOutputPreview(
    item: TraceToolItem,
    expanded: boolean,
): {
    previewLines: string[];
    hiddenLineCount: number;
    totalLineCount: number;
} {
    const lines = executeOutputContentLines(item);
    const totalLineCount = lines.length;
    if (expanded || totalLineCount === 0) {
        return {
            previewLines: lines,
            hiddenLineCount: 0,
            totalLineCount,
        };
    }
    if (totalLineCount <= compactExecutePreviewLineCount) {
        return {
            previewLines: lines,
            hiddenLineCount: 0,
            totalLineCount,
        };
    }
    const lastLine = lines[lines.length - 1] ?? "";
    return {
        previewLines: lastLine.length > 0 ? [lastLine] : [],
        hiddenLineCount: totalLineCount - 1,
        totalLineCount,
    };
}
