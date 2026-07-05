import { describe, expect, it } from "vitest";
import {
    chatReducer,
    createChatStateFromInit,
    createInitialChatState,
    joinThoughtChunks,
    replayChatState,
} from "./chatReducer";
import {
    writeCachedModelParamOptions,
    writeCachedSessionConfigOptions,
} from "../../../src/acp/session/sessionConfigOptionsCache";

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

    it("clears model config on loading and restores on sessionConfigOptions", () => {
        const withOptions = chatReducer(
            {
                ...createInitialChatState(),
                sessionConfigOptions: [
                    {
                        configId: "model",
                        name: "Model",
                        category: "model",
                        type: "select",
                        currentValue: "claude-opus-4-8",
                        options: [
                            { value: "claude-opus-4-8", name: "Opus 4.8" },
                        ],
                    },
                ],
                sessionConfigLoading: false,
            },
            { type: "sessionConfigOptionsLoading" },
        );
        expect(withOptions.sessionConfigOptions).toBeNull();
        expect(withOptions.sessionConfigLoading).toBe(true);

        const restored = chatReducer(withOptions, {
            type: "sessionConfigOptions",
            options: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-sonnet-4-6",
                    options: [
                        { value: "claude-sonnet-4-6", name: "Sonnet 4.6" },
                    ],
                },
            ],
        });
        expect(restored.sessionConfigLoading).toBe(false);
        expect(restored.sessionConfigOptions?.[0]?.currentValue).toBe(
            "claude-sonnet-4-6",
        );
    });

    it("restores cached param options immediately after a model pick", () => {
        writeCachedModelParamOptions("cursor", "GPT 5.4", [
            {
                configId: "_derived:context",
                name: "Context",
                type: "select",
                currentValue: "272k",
                options: [{ value: "272k", name: "272K" }],
            },
            {
                configId: "_derived:reasoning",
                name: "Reasoning",
                type: "select",
                currentValue: "medium",
                options: [{ value: "medium", name: "Medium" }],
            },
        ]);
        const base = {
            ...createInitialChatState(),
            sessionConfigLoading: false,
            acpAgentSelection: {
                currentName: "cursor",
                availableNames: ["cursor"],
            },
            sessionConfigOptions: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select" as const,
                    currentValue: "claude-opus-4-8",
                    options: [
                        { value: "claude-opus-4-8", name: "Opus 4.8" },
                        { value: "gpt-5.4", name: "GPT 5.4" },
                    ],
                },
                {
                    configId: "_derived:effort",
                    name: "Effort",
                    type: "select" as const,
                    currentValue: "high",
                    options: [{ value: "high", name: "High" }],
                },
            ],
        };
        const afterModelPick = chatReducer(base, {
            type: "pickSessionConfigOption",
            configId: "model",
            value: "gpt-5.4",
        });
        expect(afterModelPick.sessionConfigOptions?.map((row) => row.name)).toEqual(
            ["Model", "Context", "Reasoning"],
        );
    });

    it("seeds composer state from init cache without loading", () => {
        writeCachedSessionConfigOptions("cursor", [
            {
                configId: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "claude-opus-4-8",
                options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
            },
        ]);
        const state = createChatStateFromInit({
            type: "init",
            sessionId: "s1",
            title: "Chat",
            acpAgentName: "cursor",
            availableAcpAgents: ["cursor"],
            sessionConfigOptionsSeed: [
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-opus-4-8",
                    options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
                },
            ],
        });
        expect(state.sessionConfigLoading).toBe(false);
        expect(state.sessionConfigOptions?.[0]?.currentValue).toBe(
            "claude-opus-4-8",
        );
    });
});
