import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ACP_UI_SESSION_SCHEMA,
    createDebouncedBatchQueue,
    enqueueSessionFileWrite,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionFile,
    parseSessionHeaderBlock,
    parseSessionHeaderLine,
    parseSessionRecordAtLine,
    serializeSessionHeader,
    serializeSessionRecord,
    serializeSessionRpcRecord,
    sessionFileBaseNameFromTitle,
    shouldDeferJsonlHistoryReplay,
    shouldPersistExtensionMessage,
    uniqueSessionFileBaseNameFromTitle,
} from "./acpUiSessionJsonlFormat";

describe("enqueueSessionFileWrite", () => {
    it("runs operations for the same file in order", async () => {
        const key = "/tmp/test-session.acp";
        const order: number[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const first = enqueueSessionFileWrite(key, async () => {
            order.push(1);
            await firstGate;
            order.push(2);
        });
        const second = enqueueSessionFileWrite(key, async () => {
            order.push(3);
        });
        await new Promise<void>((resolve) => {
            queueMicrotask(() => resolve());
        });
        expect(order).toEqual([1]);
        releaseFirst?.();
        await Promise.all([first, second]);
        expect(order).toEqual([1, 2, 3]);
    });
});

describe("createDebouncedBatchQueue", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("batches appends until the debounce window elapses", async () => {
        const flushed: string[][] = [];
        const queue = createDebouncedBatchQueue({
            debounceMs: 100,
            maxBatchSize: 10,
            onFlush: async (_key, items) => {
                flushed.push([...items]);
            },
        });

        const first = queue.enqueue("session-1", "a");
        const second = queue.enqueue("session-1", "b");
        await Promise.resolve();
        expect(flushed).toEqual([]);

        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([first, second]);
        expect(flushed).toEqual([["a", "b"]]);
    });

    it("flushes immediately for marked appends", async () => {
        const flushed: string[][] = [];
        const queue = createDebouncedBatchQueue({
            debounceMs: 100,
            maxBatchSize: 10,
            onFlush: async (_key, items) => {
                flushed.push([...items]);
            },
        });

        const first = queue.enqueue("session-1", "a");
        const second = queue.enqueue("session-1", "b", true);
        await Promise.all([first, second]);
        expect(flushed).toEqual([["a", "b"]]);
    });

    it("flushes when the batch size cap is reached", async () => {
        const flushed: string[][] = [];
        const queue = createDebouncedBatchQueue({
            debounceMs: 100,
            maxBatchSize: 2,
            onFlush: async (_key, items) => {
                flushed.push([...items]);
            },
        });

        const first = queue.enqueue("session-1", "a");
        const second = queue.enqueue("session-1", "b");
        await Promise.all([first, second]);
        expect(flushed).toEqual([["a", "b"]]);
    });

    it("writes many blocks in one flush via enqueueMany", async () => {
        const flushed: string[][] = [];
        const queue = createDebouncedBatchQueue({
            debounceMs: 100,
            maxBatchSize: 10,
            onFlush: async (_key, items) => {
                flushed.push([...items]);
            },
        });

        await queue.enqueueMany("session-1", ["a", "b", "c"], true);
        expect(flushed).toEqual([["a", "b", "c"]]);
    });
});

describe("sessionFileBaseNameFromTitle", () => {
    it("sanitizes invalid characters and appends .acp", () => {
        expect(sessionFileBaseNameFromTitle("Fix auth flow")).toBe(
            "Fix auth flow.acp",
        );
        expect(sessionFileBaseNameFromTitle('bad<>:"/\\|?*name')).toBe(
            "badname.acp",
        );
    });

    it("falls back when the title is empty after sanitization", () => {
        expect(sessionFileBaseNameFromTitle("   ")).toBe("Chat.acp");
    });
});

describe("uniqueSessionFileBaseNameFromTitle", () => {
    it("adds a numeric suffix when the base name is taken", () => {
        const used = new Set(["Chat 1.acp"]);
        expect(uniqueSessionFileBaseNameFromTitle("Chat 1", used)).toBe(
            "Chat 1 (2).acp",
        );
    });

    it("keeps the current file name when excluding it", () => {
        const used = new Set(["Chat 1.acp", "Chat 2.acp"]);
        expect(
            uniqueSessionFileBaseNameFromTitle("Chat 1", used, "Chat 1.acp"),
        ).toBe("Chat 1.acp");
    });
});

describe("serializeSessionRecord", () => {
    it("writes pretty-printed JSON without a debug comment line", () => {
        const block = serializeSessionRecord({ type: "submit", body: "hi" });
        expect(block.startsWith("//")).toBe(false);
        expect(block).toBe(
            `${JSON.stringify({ type: "submit", body: "hi" }, null, 2)}\n`,
        );
        const parsed = parseSessionRecordAtLine(block.trimEnd().split("\n"), 0);
        expect(parsed?.value).toEqual({ type: "submit", body: "hi" });
    });
});

describe("serializeSessionRpcRecord", () => {
    it("writes compact JSON by default", () => {
        const payload = {
            jsonrpc: "2.0",
            method: "session/prompt",
            id: 1,
        };
        const block = serializeSessionRpcRecord(payload);
        expect(block).toBe(`${JSON.stringify(payload)}\n`);
        const parsed = parseSessionRecordAtLine(block.trimEnd().split("\n"), 0);
        expect(parsed?.value).toEqual(payload);
    });

    it("pretty-prints when requested", () => {
        const payload = {
            jsonrpc: "2.0",
            id: 0,
            result: { protocolVersion: 1 },
        };
        const block = serializeSessionRpcRecord(payload, { pretty: true });
        expect(block).toBe(`${JSON.stringify(payload, null, 2)}\n`);
        const parsed = parseSessionRecordAtLine(block.trimEnd().split("\n"), 0);
        expect(parsed?.value).toEqual(payload);
    });
});

describe("serializeSessionHeader", () => {
    it("writes pretty-printed JSON without a debug comment line", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
        };
        const line = serializeSessionHeader(header);
        expect(line).toBe(`${JSON.stringify(header, null, 2)}\n`);
        expect(line.startsWith("//")).toBe(false);
        const parsed = parseSessionFile(`${line.trimEnd()}\n`);
        expect(parsed.header).toEqual(header);
    });
});

describe("parseSessionHeaderBlock", () => {
    it("spans all lines of a pretty-printed header", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
        };
        const text = [
            serializeSessionHeader(header).trimEnd(),
            serializeSessionRecord({ type: "submit", body: "hi" }).trimEnd(),
        ].join("\n");
        const parsed = parseSessionHeaderBlock(text);
        expect(parsed?.header).toEqual(header);
        expect(parsed?.consumedLines).toBeGreaterThan(1);
        const lines = text.split("\n");
        expect(lines.slice(0, parsed?.consumedLines).join("\n")).toBe(
            serializeSessionHeader(header).trimEnd(),
        );
    });
});

describe("parseSessionHeaderLine", () => {
    it("parses a valid legacy single-line header", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "abc",
            title: "Chat 1",
            agentName: "Cursor",
            runtimeSessionId: "runtime-1",
            promptHistory: ["hello"],
            createdAt: 100,
            updatedAt: 200,
        };
        const parsed = parseSessionHeaderLine(JSON.stringify(header));
        expect(parsed).toEqual(header);
    });

    it("returns null for malformed header", () => {
        expect(parseSessionHeaderLine("{}")).toBeNull();
        expect(parseSessionHeaderLine("")).toBeNull();
        expect(parseSessionHeaderLine("not json")).toBeNull();
    });
});

describe("parseSessionFile", () => {
    it("parses pretty header and replay events", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
        };
        const text = [
            serializeSessionHeader(header).trimEnd(),
            serializeSessionRecord({ type: "submit", body: "hi" }).trimEnd(),
            serializeSessionRecord({
                type: "appendAgentText",
                text: "hello",
            }).trimEnd(),
            "",
        ].join("\n");
        const parsed = parseSessionFile(text);
        expect(parsed.header?.id).toBe("id-1");
        expect(parsed.events).toEqual([
            { type: "submit", body: "hi" },
            { type: "appendAgentText", text: "hello" },
        ]);
    });

    it("parses legacy single-line header and events", () => {
        const header = JSON.stringify({
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
        });
        const text = [
            header,
            JSON.stringify({ type: "submit", body: "hi" }),
            JSON.stringify({ type: "appendAgentText", text: "hello" }),
            "",
            "bad line",
        ].join("\n");
        const parsed = parseSessionFile(text);
        expect(parsed.header?.id).toBe("id-1");
        expect(parsed.events).toEqual([
            { type: "submit", body: "hi" },
            { type: "appendAgentText", text: "hello" },
        ]);
    });

    it("skips non-replayable rpc records", () => {
        const header = serializeSessionHeader({
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
        }).trimEnd();
        const rpc = serializeSessionRpcRecord({
            jsonrpc: "2.0",
            method: "session/prompt",
            id: 1,
        }).trimEnd();
        const event = serializeSessionRecord({
            type: "submit",
            body: "x",
        }).trimEnd();
        const parsed = parseSessionFile(`${header}\n${rpc}\n${event}\n`);
        expect(parsed.events).toEqual([{ type: "submit", body: "x" }]);
    });
});

describe("parseSessionEventLines", () => {
    it("skips invalid lines", () => {
        const events = parseSessionEventLines([
            JSON.stringify({ type: "submit", body: "x" }),
            "{broken",
            JSON.stringify({ type: "permissionRequest", requestId: "1" }),
        ]);
        expect(events).toEqual([{ type: "submit", body: "x" }]);
    });
});

describe("shouldDeferJsonlHistoryReplay", () => {
    it("defers when a runtime session id is stored", () => {
        expect(
            shouldDeferJsonlHistoryReplay({ runtimeSessionId: "runtime-1" }),
        ).toBe(true);
        expect(
            shouldDeferJsonlHistoryReplay({
                runtimeSessionId: "  runtime-1  ",
            }),
        ).toBe(true);
    });

    it("does not defer without a runtime session id", () => {
        expect(shouldDeferJsonlHistoryReplay({})).toBe(false);
        expect(shouldDeferJsonlHistoryReplay({ runtimeSessionId: "" })).toBe(
            false,
        );
        expect(shouldDeferJsonlHistoryReplay({ runtimeSessionId: "   " })).toBe(
            false,
        );
    });
});

describe("append and replay round-trip", () => {
    it("replays a transcript built from serialized append blocks", () => {
        const header = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "ui-session-uuid",
            title: "Chat",
            runtimeSessionId: "agent-runtime-id",
            createdAt: 1,
            updatedAt: 2,
        };
        const events = [
            { type: "submit" as const, body: "hello" },
            { type: "appendAgentText" as const, text: "world" },
            { type: "turnComplete" as const, stopReason: "end_turn" },
        ];
        const lines = [serializeSessionHeader(header).trimEnd()];
        for (const event of events) {
            lines.push(serializeSessionRecord(event).trimEnd());
        }
        const parsed = parseSessionFile(`${lines.join("\n")}\n`);
        expect(parsed.header?.id).toBe("ui-session-uuid");
        expect(parsed.header?.runtimeSessionId).toBe("agent-runtime-id");
        expect(parsed.events).toEqual(events);
    });
});

describe("shouldPersistExtensionMessage", () => {
    it("persists transcript messages", () => {
        expect(
            shouldPersistExtensionMessage({
                type: "appendAgentText",
                text: "hi",
            }),
        ).toBe(true);
        expect(
            shouldPersistExtensionMessage({
                type: "turnComplete",
                stopReason: "end",
            }),
        ).toBe(true);
    });

    it("skips ephemeral messages", () => {
        expect(
            shouldPersistExtensionMessage({
                type: "permissionRequest",
                requestId: "1",
                toolTitle: "tool",
                options: [],
            }),
        ).toBe(false);
        expect(
            shouldPersistExtensionMessage({
                type: "sessionHistoryLoading",
                loading: true,
            }),
        ).toBe(false);
        expect(
            shouldPersistExtensionMessage({
                type: "error",
                message: "oops",
            }),
        ).toBe(false);
    });
});

describe("isReplayableSessionEvent", () => {
    it("accepts submit and extension messages", () => {
        expect(isReplayableSessionEvent({ type: "submit", body: "x" })).toBe(
            true,
        );
        expect(isReplayableSessionEvent({ type: "sessionReset" })).toBe(true);
    });

    it("rejects ephemeral events", () => {
        expect(
            isReplayableSessionEvent({
                type: "cursorAskQuestionRequest",
                requestId: "1",
                questions: [],
            }),
        ).toBe(false);
    });
});
