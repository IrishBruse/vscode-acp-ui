import { describe, expect, it } from "vitest";
import type { TraceToolItem } from "./chatReducer";
import {
    compactToolDetailLine,
    compactToolGroupSummary,
    diffLineStats,
} from "./toolCallCompactText";

function toolItem(
    overrides: Partial<TraceToolItem> & Pick<TraceToolItem, "toolCallId">,
): TraceToolItem {
    return {
        type: "tool",
        title: "Tool",
        kind: undefined,
        subtitle: undefined,
        status: "completed",
        content: undefined,
        diffRows: undefined,
        detailVisible: false,
        ...overrides,
    };
}

describe("toolCallCompactText", () => {
    it("formats a single edit with diff stats", () => {
        const item = toolItem({
            toolCallId: "edit-1",
            kind: "edit",
            subtitle: "webview/acp-ui/src/chatReducer.test.ts",
            diffRows: [
                { kind: "context", text: " unchanged" },
                { kind: "added", text: "+line" },
                { kind: "added", text: "+line2" },
            ],
        });
        expect(compactToolDetailLine(item)).toBe(
            "Edited chatReducer.test.ts +2",
        );
        expect(compactToolGroupSummary([item])).toBe(
            "Edited chatReducer.test.ts +2",
        );
    });

    it("formats read tools with optional line ranges", () => {
        const item = toolItem({
            toolCallId: "read-1",
            kind: "read",
            title: "Read File",
            subtitle: "webview/acp-ui/src/chatReducer.test.ts",
            content: "lines 218-267\nbody",
        });
        expect(compactToolDetailLine(item)).toBe(
            "Read webview/acp-ui/src/chatReducer.test.ts lines 218-267",
        );
    });

    it("formats grep tools with pattern and path", () => {
        const item = toolItem({
            toolCallId: "grep-1",
            kind: "search",
            title: "Grep",
            subtitle: "webview/acp-ui/src/chatReducer.test.ts",
            content: 'Grepped "createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
        });
        expect(compactToolDetailLine(item)).toBe(
            'Grepped "createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
        );
    });

    it("summarizes grouped reads and grep", () => {
        const items = [
            toolItem({
                toolCallId: "read-1",
                kind: "read",
                subtitle: "webview/acp-ui/src/ui.tsx",
            }),
            toolItem({
                toolCallId: "read-2",
                kind: "read",
                subtitle: "webview/acp-ui/src/main.ts",
            }),
            toolItem({
                toolCallId: "read-3",
                kind: "read",
                subtitle: "webview/acp-ui/src/chatReducer.test.ts",
                content: "lines 218-267",
            }),
            toolItem({
                toolCallId: "grep-1",
                kind: "search",
                subtitle: "webview/acp-ui/src/chatReducer.test.ts",
                content: 'Grepped "createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
            }),
        ];
        expect(compactToolGroupSummary(items)).toBe("Read 3 files, 1 grep");
    });

    it("counts diff rows", () => {
        expect(
            diffLineStats([
                { kind: "removed", text: "a" },
                { kind: "added", text: "b" },
                { kind: "added", text: "c" },
            ]),
        ).toEqual({ added: 2, removed: 1 });
    });
});
