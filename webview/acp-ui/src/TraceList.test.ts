import { describe, expect, it } from "vitest";
import type { TraceItem, TraceToolItem } from "./chatReducer";

function toolItem(
    toolCallId: string,
    kind: TraceToolItem["kind"] = "read",
): TraceToolItem {
    return {
        type: "tool",
        toolCallId,
        title: "Tool",
        kind,
        subtitle: `${toolCallId}.ts`,
        status: "completed",
        content: undefined,
        diffRows: undefined,
        detailVisible: false,
    };
}

/** Mirrors TraceList partition rules for unit testing. */
function partitionToolSegmentKinds(
    items: TraceItem[],
    toolCallVerbosity: "minimal" | "compact" | "verbose",
): string[] {
    const kinds: string[] = [];
    let toolBuffer: TraceToolItem[] = [];

    const flush = (): void => {
        if (toolBuffer.length === 0) {
            return;
        }
        if (toolCallVerbosity === "minimal") {
            kinds.push(`group:${toolBuffer.length}`);
        } else if (toolCallVerbosity === "compact") {
            for (const tool of toolBuffer) {
                kinds.push(`compact:${tool.toolCallId}`);
            }
        } else {
            for (const tool of toolBuffer) {
                kinds.push(`verbose:${tool.toolCallId}`);
            }
        }
        toolBuffer = [];
    };

    for (const item of items) {
        if (item.type !== "tool") {
            flush();
            kinds.push(item.type);
            continue;
        }
        const groupable = item.kind !== "execute" && item.kind !== "terminal";
        if (
            (toolCallVerbosity === "minimal" ||
                toolCallVerbosity === "compact") &&
            !groupable
        ) {
            flush();
            kinds.push(`execute:${item.toolCallId}`);
            continue;
        }
        if (toolCallVerbosity === "minimal") {
            toolBuffer.push(item);
            continue;
        }
        if (toolCallVerbosity === "compact") {
            flush();
            kinds.push(`compact:${item.toolCallId}`);
            continue;
        }
        toolBuffer.push(item);
    }
    flush();
    return kinds;
}

describe("TraceList tool partitioning", () => {
    const reads = [
        toolItem("read-1"),
        toolItem("read-2"),
        toolItem("read-3"),
        toolItem("read-4"),
    ];

    it("groups consecutive reads in minimal mode", () => {
        expect(partitionToolSegmentKinds(reads, "minimal")).toEqual(["group:4"]);
    });

    it("emits one compact line per read in compact mode", () => {
        expect(partitionToolSegmentKinds(reads, "compact")).toEqual([
            "compact:read-1",
            "compact:read-2",
            "compact:read-3",
            "compact:read-4",
        ]);
    });

    it("keeps execute tools separate from groups in minimal mode", () => {
        const items: TraceItem[] = [
            toolItem("read-1"),
            toolItem("run-1", "execute"),
            toolItem("read-2"),
        ];
        expect(partitionToolSegmentKinds(items, "minimal")).toEqual([
            "group:1",
            "execute:run-1",
            "group:1",
        ]);
    });
});
