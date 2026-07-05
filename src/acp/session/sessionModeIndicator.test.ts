import { describe, expect, it } from "vitest";
import {
    resolveSessionModeIndicator,
    sessionModeIndicatorFromOption,
} from "./sessionModeIndicator";

describe("resolveSessionModeIndicator", () => {
    it("hides default agent and code modes", () => {
        expect(resolveSessionModeIndicator("agent")).toEqual({
            visible: false,
        });
        expect(resolveSessionModeIndicator("code")).toEqual({ visible: false });
        expect(resolveSessionModeIndicator("normal")).toEqual({
            visible: false,
        });
    });

    it("shows colored labels for ask, plan, and debug", () => {
        expect(resolveSessionModeIndicator("ask")).toEqual({
            visible: true,
            label: "Ask",
            tone: "ask",
        });
        expect(resolveSessionModeIndicator("plan", "Plan mode")).toEqual({
            visible: true,
            label: "Plan mode",
            tone: "plan",
        });
        expect(resolveSessionModeIndicator("debug")).toEqual({
            visible: true,
            label: "Debug",
            tone: "debug",
        });
    });
});

describe("sessionModeIndicatorFromOption", () => {
    it("uses the active choice name when available", () => {
        expect(
            sessionModeIndicatorFromOption({
                configId: "mode",
                name: "Mode",
                category: "mode",
                type: "select",
                currentValue: "ask",
                options: [{ value: "ask", name: "Ask questions" }],
            }),
        ).toEqual({
            visible: true,
            label: "Ask questions",
            tone: "ask",
        });
    });
});
