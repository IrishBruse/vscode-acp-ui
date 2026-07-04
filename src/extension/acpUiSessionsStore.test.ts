import { describe, expect, it } from "vitest";
import { parseStoredChatItems } from "./acpUiLegacySessions";

describe("parseStoredChatItems", () => {
    it("accepts well-formed stored records", () => {
        const parsed = parseStoredChatItems([
            {
                id: "chat-1",
                title: "Chat 1",
                agentName: "Cursor",
                sessionId: "session-abc",
                updatedAt: 123,
            },
        ]);
        expect(parsed).toEqual([
            {
                id: "chat-1",
                title: "Chat 1",
                agentName: "Cursor",
                sessionId: "session-abc",
                updatedAt: 123,
            },
        ]);
    });

    it("returns null for malformed payloads", () => {
        const parsed = parseStoredChatItems([
            {
                id: "chat-1",
                title: "",
                agentName: "Cursor",
                sessionId: "session-abc",
                updatedAt: 123,
            },
        ]);
        expect(parsed).toBeNull();
    });
});
