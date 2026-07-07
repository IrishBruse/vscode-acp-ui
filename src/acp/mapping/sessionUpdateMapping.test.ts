import { describe, expect, it } from "vitest";
import {
    createToolCallKindTracking,
    searchStatsSubtitleFromRawOutput,
    sessionUpdateToWebviewMessages,
    toolCallUpdateSubtitleHint,
} from "./sessionUpdateMapping";

describe("sessionUpdateToWebviewMessages", () => {
    it("maps user_message_chunk to appendUserText", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "hello" },
        });
        expect(messages).toEqual([{ type: "appendUserText", text: "hello" }]);
    });

    it("derives grep match counts from Cursor-style rawOutput", () => {
        expect(
            searchStatsSubtitleFromRawOutput({
                totalMatches: 2,
                truncated: false,
            }),
        ).toBe("2 matches");
        expect(
            searchStatsSubtitleFromRawOutput({
                totalFiles: 209,
                truncated: false,
            }),
        ).toBe("209 files");
    });

    it("maps sparse Cursor grep completion to subtitle with match count", () => {
        const tracking = createToolCallKindTracking();
        sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call",
                toolCallId: "tool_a471658c",
                title: "grep",
                kind: "search",
                status: "pending",
                rawInput: {},
            },
            tracking,
        );
        const messages = sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call_update",
                toolCallId: "tool_a471658c",
                status: "completed",
                rawOutput: { totalMatches: 2, truncated: false },
            },
            tracking,
        );
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "tool_a471658c",
                status: "completed",
                content: "2 match(es), complete",
                subtitle: "2 matches",
            },
        ]);
    });

    it("extracts path from Cursor-style search error rawOutput", () => {
        const hint = toolCallUpdateSubtitleHint({
            sessionUpdate: "tool_call_update",
            toolCallId: "tool_4298cf79",
            status: "completed",
            kind: "search",
            rawOutput: {
                error: "Path does not exist: /home/econn/.cursor/projects/home-econn-git-vscode-acp-ui-docs/agent-transcripts",
            },
        });
        expect(hint).toBe(
            "/home/econn/.cursor/projects/home-econn-git-vscode-acp-ui-docs/agent-transcripts",
        );
    });

    it("derives pattern and path subtitles from structured rawInput", () => {
        const hint = toolCallUpdateSubtitleHint({
            sessionUpdate: "tool_call_update",
            toolCallId: "tool_grep",
            status: "completed",
            kind: "search",
            rawInput: {
                pattern: "createChatStateFromInit",
                path: "webview/acp-ui/src/chatReducer.test.ts",
            },
        });
        expect(hint).toBe(
            '"createChatStateFromInit" in webview/acp-ui/src/chatReducer.test.ts',
        );
    });
});
