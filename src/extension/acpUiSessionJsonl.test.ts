import { describe, expect, it } from "vitest";
import {
    ACP_UI_SESSION_SCHEMA,
    enqueueSessionFileWrite,
    isFlatSessionFilePath,
    normalizeUserMessageHistory,
    parseSessionDocument,
    parseSessionFile,
    parseSessionHeaderBlock,
    parseSessionHeaderLine,
    serializeSessionDocument,
    sessionFileBaseNameFromTitle,
    shouldDeferJsonlHistoryReplay,
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

describe("normalizeUserMessageHistory", () => {
    it("keeps non-empty strings and caps at 55 entries", () => {
        const entries = Array.from({ length: 60 }, (_, i) => `msg-${i}`);
        expect(normalizeUserMessageHistory(entries)).toHaveLength(55);
        expect(normalizeUserMessageHistory(["", "hello", 1, null])).toEqual([
            "hello",
        ]);
    });

    it("extracts submit bodies from legacy replay events", () => {
        expect(
            normalizeUserMessageHistory([
                { type: "submit", body: "hello" },
                { type: "appendAgentText", text: "ignored" },
            ]),
        ).toEqual(["hello"]);
    });
});

describe("serializeSessionDocument", () => {
    it("round-trips a session document with user message history", () => {
        const document = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
            history: ["hello", "world"],
        };
        const text = serializeSessionDocument(document);
        expect(parseSessionDocument(text)).toEqual(document);
        expect(parseSessionFile(text).header).toEqual(document);
    });
});

describe("parseSessionHeaderBlock", () => {
    it("spans all lines of a session document", () => {
        const document = {
            schema: ACP_UI_SESSION_SCHEMA,
            id: "id-1",
            title: "Chat",
            createdAt: 1,
            updatedAt: 2,
            history: ["hi"],
        };
        const text = serializeSessionDocument(document).trimEnd();
        const parsed = parseSessionHeaderBlock(text);
        expect(parsed?.header).toEqual(document);
        expect(parsed?.consumedLines).toBe(text.split("\n").length);
    });
});

describe("parseSessionHeaderLine", () => {
    it("parses a valid legacy single-line header with promptHistory", () => {
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
        expect(parsed).toEqual({
            schema: ACP_UI_SESSION_SCHEMA,
            id: "abc",
            title: "Chat 1",
            agentName: "Cursor",
            runtimeSessionId: "runtime-1",
            createdAt: 100,
            updatedAt: 200,
            history: ["hello"],
        });
    });

    it("returns null for malformed header", () => {
        expect(parseSessionHeaderLine("{}")).toBeNull();
        expect(parseSessionHeaderLine("")).toBeNull();
        expect(parseSessionHeaderLine("not json")).toBeNull();
    });
});

describe("isFlatSessionFilePath", () => {
    it("detects legacy flat files directly under the chats root", () => {
        expect(
            isFlatSessionFilePath("/data/chats/My Chat.acp", "/data/chats"),
        ).toBe(true);
        expect(
            isFlatSessionFilePath(
                "/data/chats/session-id/My Chat.acp",
                "/data/chats",
            ),
        ).toBe(false);
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
