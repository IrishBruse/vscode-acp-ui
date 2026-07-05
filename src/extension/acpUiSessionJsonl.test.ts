import { describe, expect, it } from "vitest";
import {
    ACP_UI_SESSION_SCHEMA,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionFile,
    parseSessionHeaderLine,
    parseSessionRecordAtLine,
    serializeSessionHeader,
    serializeSessionRecord,
    shouldPersistExtensionMessage,
} from "./acpUiSessionJsonlFormat";

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
