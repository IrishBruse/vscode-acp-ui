import { describe, expect, it } from "vitest";
import { sessionUpdateToWebviewMessages } from "./sessionUpdateMapping";

describe("sessionUpdateToWebviewMessages", () => {
    it("maps user_message_chunk to appendUserText", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: "hello" },
        });
        expect(messages).toEqual([{ type: "appendUserText", text: "hello" }]);
    });
});
