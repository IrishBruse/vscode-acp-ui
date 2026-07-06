import { describe, expect, it } from "vitest";
import type { TraceToolItem } from "./chatReducer";
import {
    compactToolDetailLine,
    compactToolDetailParts,
    compactToolGroupSummary,
    compactToolGroupSummaryParts,
    diffLineStats,
    executeOutputPreview,
    isCompactGroupableTool,
    setCompactToolPathHome,
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
    it("shortens absolute paths under home in compact labels", () => {
        setCompactToolPathHome("/home/econn");
        const item = toolItem({
            toolCallId: "read-abs",
            kind: "read",
            subtitle: "/home/econn/git/vscode-acp-ui/AGENTS.md",
        });
        expect(compactToolDetailLine(item)).toBe("Read AGENTS.md");
        expect(compactToolDetailParts(item)).toMatchObject({
            verb: "Read",
            detail: "AGENTS.md",
            pathSegment: {
                label: "AGENTS.md",
                title: "~/git/vscode-acp-ui/AGENTS.md",
                openPath: "/home/econn/git/vscode-acp-ui/AGENTS.md",
            },
        });
        const grep = toolItem({
            toolCallId: "grep-abs",
            kind: "search",
            title: "Grep",
            subtitle: "/home/econn/git/vscode-acp-ui",
        });
        expect(compactToolDetailLine(grep)).toBe("Grepped vscode-acp-ui");
        expect(compactToolDetailParts(grep).pathSegment?.title).toBe(
            "~/git/vscode-acp-ui",
        );
    });

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
            "Read chatReducer.test.ts lines 218-267",
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
            'Grepped "createChatStateFromInit" in chatReducer.test.ts',
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
                content:
                    'Grepped "createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
            }),
        ];
        expect(compactToolGroupSummary(items)).toBe(
            "Grepped, read 1 grep, 3 files",
        );
        expect(compactToolGroupSummaryParts(items)).toEqual({
            verbs: "Grepped, read",
            counts: "1 grep, 3 files",
        });
    });

    it("splits verb and detail for styling", () => {
        const item = toolItem({
            toolCallId: "read-1",
            kind: "read",
            subtitle: "webview/acp-ui/src/components/TraceList.css",
        });
        expect(compactToolDetailParts(item)).toEqual({
            verb: "Read",
            detail: "TraceList.css",
            pathSegment: {
                label: "TraceList.css",
                title: "webview/acp-ui/src/components/TraceList.css",
                openPath: "webview/acp-ui/src/components/TraceList.css",
            },
        });
        expect(compactToolDetailParts(item).pathSegment?.openTarget).toBeUndefined();
    });

    it("marks grep paths for auto open (folder reveal or file editor)", () => {
        const item = toolItem({
            toolCallId: "grep-1",
            kind: "search",
            title: "Grep",
            subtitle: "/home/econn/git/vscode-acp-ui",
        });
        setCompactToolPathHome("/home/econn");
        expect(compactToolDetailParts(item).pathSegment?.openTarget).toBe(
            "auto",
        );
    });

    it("treats kind grep like search for compact formatting", () => {
        const item = toolItem({
            toolCallId: "grep-kind",
            kind: "grep",
            title: "Tool",
            subtitle: "/home/econn/git/vscode-acp-ui",
        });
        setCompactToolPathHome("/home/econn");
        expect(compactToolDetailLine(item)).toBe("Grepped vscode-acp-ui");
        expect(compactToolDetailParts(item).pathSegment?.openTarget).toBe(
            "auto",
        );
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

    it("keeps execute tools out of compact groups", () => {
        expect(
            isCompactGroupableTool(
                toolItem({ toolCallId: "run-1", kind: "execute" }),
            ),
        ).toBe(false);
        expect(
            isCompactGroupableTool(
                toolItem({ toolCallId: "read-1", kind: "read" }),
            ),
        ).toBe(true);
    });

    it("previews long terminal output with a hidden-line hint and last line", () => {
        const lines = Array.from({ length: 24 }, (_, index) => `line ${index}`);
        lines[23] = "✓ built in 132ms";
        const item = toolItem({
            toolCallId: "run-1",
            kind: "execute",
            subtitle: "npm run build:webview",
            content: `$ npm run build:webview\n${lines.join("\n")}`,
        });
        expect(executeOutputPreview(item, false)).toEqual({
            previewLines: ["✓ built in 132ms"],
            hiddenLineCount: 23,
            totalLineCount: 24,
        });
    });
});
