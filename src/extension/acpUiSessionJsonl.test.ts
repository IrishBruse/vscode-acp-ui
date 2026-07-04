import { describe, expect, it } from "vitest";
import {
    ACP_UI_SESSION_SCHEMA,
    isReplayableSessionEvent,
    parseSessionEventLines,
    parseSessionFile,
    parseSessionHeaderLine,
    serializeSessionHeader,
    shouldPersistExtensionMessage,
} from "./acpUiSessionJsonlFormat";

describe("parseSessionHeaderLine", () => {
    it("parses a valid header", () => {
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
        const parsed = parseSessionHeaderLine(serializeSessionHeader(header));
        expect(parsed).toEqual(header);
    });

    it("returns null for malformed header", () => {
        expect(parseSessionHeaderLine("{}")).toBeNull();
        expect(parseSessionHeaderLine("")).toBeNull();
        expect(parseSessionHeaderLine("not json")).toBeNull();
    });
});

describe("parseSessionFile", () => {
    it("parses header and replay events", () => {
        const header = serializeSessionHeader({
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
