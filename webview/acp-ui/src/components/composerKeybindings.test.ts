import { describe, expect, it } from "vitest";
import {
    shouldCancelRunOnCtrlC,
    shouldOpenNewChatOnCtrlT,
} from "./composerKeybindings";

describe("shouldOpenNewChatOnCtrlT", () => {
    it("opens on ctrl+t or cmd+t without modifiers", () => {
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(true);
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: false,
                metaKey: true,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(true);
    });

    it("ignores shift+t and plain t", () => {
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: true,
            }),
        ).toBe(false);
        expect(
            shouldOpenNewChatOnCtrlT({
                key: "t",
                ctrlKey: false,
                metaKey: false,
                altKey: false,
                shiftKey: false,
            }),
        ).toBe(false);
    });
});

describe("shouldCancelRunOnCtrlC", () => {
    it("cancels when in-flight and no selection", () => {
        expect(
            shouldCancelRunOnCtrlC({
                key: "c",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
                hasSelection: false,
                promptInFlight: true,
            }),
        ).toBe(true);
    });

    it("does not cancel when text is selected", () => {
        expect(
            shouldCancelRunOnCtrlC({
                key: "c",
                ctrlKey: true,
                metaKey: false,
                altKey: false,
                shiftKey: false,
                hasSelection: true,
                promptInFlight: true,
            }),
        ).toBe(false);
    });
});
