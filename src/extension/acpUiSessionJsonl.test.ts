import { describe, expect, it } from "vitest";
import {
    ACP_UI_SESSION_SCHEMA,
    enqueueSessionFileWrite,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionFile,
    parseSessionHeaderLine,
    parseSessionRecordAtLine,
    serializeSessionHeader,
    serializeSessionRecord,
    shouldDeferJsonlHistoryReplay,
    shouldPersistExtensionMessage,
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

describe("serializeSessionRecord", () => {
    it("writes a debug comment line then pretty-printed JSON", () => {
        const block = serializeSessionRecord(
            { type: "submit", body: "hi" },
            { record: "event", type: "submit", durationMs: 42 },
        );
        const lines = block.trimEnd().split("\n");
        expect(lines[0]).toBe("// event submit | 42ms");
        expect(lines[1]).toBe("{");
        expect(lines[2]).toContain('"type": "submit"');
        const parsed = parseSessionRecordAtLine(lines, 0);
        expect(parsed?.value).toEqual({ type: "submit", body: "hi" });
    });

    it("formats rpc responses like the debug comment example", () => {
        const payload = {
            jsonrpc: "2.0",
            id: 0,
            result: { protocolVersion: 1 },
        };
        const block = serializeSessionRecord(payload, {
            record: "rpc",
            method: "initialize",
            durationMs: 100,
            direction: "fromAgent",
        });
        expect(
            block.startsWith("// initialize | 100ms | from agent\n{\n"),
        ).toBe(true);
        const parsed = parseSessionRecordAtLine(block.trimEnd().split("\n"), 0);
        expect(parsed?.value).toEqual(payload);
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
            serializeSessionRecord(
                { type: "submit", body: "hi" },
                { record: "event", type: "submit" },
            ).trimEnd(),
            serializeSessionRecord(
                { type: "appendAgentText", text: "hello" },
                { record: "event", type: "appendAgentText" },
            ).trimEnd(),
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
        const rpc = serializeSessionRecord(
            { jsonrpc: "2.0", method: "session/prompt", id: 1 },
            {
                record: "rpc",
                method: "session/prompt",
                direction: "toAgent",
            },
        ).trimEnd();
        const event = serializeSessionRecord(
            { type: "submit", body: "x" },
            { record: "event", type: "submit" },
        ).trimEnd();
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
            shouldDeferJsonlHistoryReplay({ runtimeSessionId: "  runtime-1  " }),
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
            lines.push(
                serializeSessionRecord(event, {
                    record: "event",
                    type: event.type,
                }).trimEnd(),
            );
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
