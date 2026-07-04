import { describe, expect, it } from "vitest";
import {
    chatReducer,
    createChatStateFromInit,
    createInitialChatState,
    joinThoughtChunks,
    replayChatState,
} from "./chatReducer";

describe("chatReducer", () => {
    it("merges appendAgentThought chunks into one thought row", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "appendAgentThought",
            text: "Considering test execution\n",
            durationMs: 700,
        });
        state = chatReducer(state, {
            type: "appendAgentThought",
            text: "Need to validate before continuing.",
        });
        expect(state.trace).toHaveLength(1);
        const row = state.trace[0];
        expect(row?.type).toBe("thought");
        if (row?.type !== "thought") {
            return;
        }
        expect(row.durationMs).toBe(700);
        expect(row.text).toContain("Considering test execution");
        expect(row.text).toContain("Need to validate");
    });

    it("adds one space between adjacent thought words", () => {
        expect(joinThoughtChunks("hello", "world")).toBe("hello world");
        expect(joinThoughtChunks("hello ", "world")).toBe("hello world");
        expect(joinThoughtChunks("hello", ", world")).toBe("hello, world");
    });

    it("does not alter spacing inside fenced code block streams", () => {
        expect(joinThoughtChunks("```ts\nconst x", "=1;\n```")).toBe(
            "```ts\nconst x=1;\n```",
        );
    });

    it("merges appendToolCall into an existing tool row from an earlier updateToolCall", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "updateToolCall",
            toolCallId: "early",
            status: "pending",
            subtitle: "npm test",
            content: undefined,
            diffRows: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const before = state.trace[0];
        expect(before?.type).toBe("tool");
        if (before?.type !== "tool") {
            return;
        }
        expect(before.title).toBe("Tool");
        expect(before.kind).toBeUndefined();
        state = chatReducer(state, {
            type: "appendToolCall",
            toolCallId: "early",
            title: "Run command",
            kind: "execute",
            status: "in_progress",
            subtitle: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const after = state.trace[0];
        expect(after?.type).toBe("tool");
        if (after?.type !== "tool") {
            return;
        }
        expect(after.title).toBe("Run command");
        expect(after.kind).toBe("execute");
        expect(after.subtitle).toBe("npm test");
    });

    it("labels edit tools as Write File when only updateToolCall arrives (Gemini-style)", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "updateToolCall",
            toolCallId: "write-1",
            status: "completed",
            kind: "edit",
            subtitle: "/home/econn/git/irishbruse-acp/test.txt",
            diffRows: [
                { kind: "added", text: "hello world" },
            ],
        });
        expect(state.trace).toHaveLength(1);
        const row = state.trace[0];
        expect(row?.type).toBe("tool");
        if (row?.type !== "tool") {
            return;
        }
        expect(row.title).toBe("Write File");
        expect(row.kind).toBe("edit");
        expect(row.subtitle).toContain("test.txt");
    });

    it("replays submit and agent text from persisted events", () => {
        const init = {
            type: "init" as const,
            sessionId: "s1",
            title: "Chat",
        };
        const state = replayChatState(init, [
            { type: "submit", body: "hello" },
            { type: "appendAgentText", text: "hi there" },
            { type: "turnComplete", stopReason: "end" },
        ]);
        expect(state.trace).toEqual([
            { type: "user", text: "hello" },
            { type: "agent", text: "hi there" },
        ]);
        expect(state.promptInFlight).toBe(false);
    });
});
