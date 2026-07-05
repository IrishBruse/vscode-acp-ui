import { describe, expect, it } from "vitest";
import {
    resolveComposerPlaceholder,
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

    it("shows colored labels for ask and plan", () => {
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
        expect(resolveSessionModeIndicator("architect", "Architect")).toEqual({
            visible: true,
            label: "Architect",
            tone: "plan",
        });
        expect(resolveSessionModeIndicator("debug")).toEqual({
            visible: false,
        });
    });
});

describe("resolveComposerPlaceholder", () => {
    it("uses mode-specific copy without a trailing ellipsis", () => {
        expect(resolveComposerPlaceholder("agent")).toBe(
            "Describe a task for the agent to do",
        );
        expect(resolveComposerPlaceholder("ask")).toBe(
            "Ask the agent a question",
        );
        expect(resolveComposerPlaceholder("plan")).toBe(
            "Describe what you want the agent to plan",
        );
        expect(resolveComposerPlaceholder("architect")).toBe(
            "Describe what you want the agent to plan",
        );
        expect(resolveComposerPlaceholder("debug")).toBe(
            "Describe a task for the agent to do",
        );
    });

    it("matches ACP agent, plan, and ask modes", () => {
        const options = [
            { value: "agent", name: "Agent" },
            { value: "plan", name: "Plan" },
            { value: "ask", name: "Ask" },
        ];
        for (const { value, name } of options) {
            expect(
                sessionModeIndicatorFromOption({
                    configId: "mode",
                    name: "Mode",
                    category: "mode",
                    type: "select",
                    currentValue: value,
                    options,
                }),
            ).toEqual(
                value === "agent"
                    ? { visible: false }
                    : {
                          visible: true,
                          label: name,
                          tone: value === "ask" ? "ask" : "plan",
                      },
            );
            expect(resolveComposerPlaceholder(value)).toBe(
                value === "agent"
                    ? "Describe a task for the agent to do"
                    : value === "ask"
                      ? "Ask the agent a question"
                      : "Describe what you want the agent to plan",
            );
        }
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
