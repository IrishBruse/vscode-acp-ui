import { describe, expect, it } from "vitest";
import {
    buildModelId,
    buildModelPickerState,
    formatModelDisplayName,
    formatVariantLabel,
    parseModelIdBracketParams,
    pickVariantForGroup,
} from "./modelVariantPicker";

describe("parseModelIdBracketParams", () => {
    it("parses bracket params", () => {
        expect(
            parseModelIdBracketParams(
                "claude-opus-4-6[thinking=true,context=200k]",
            ),
        ).toEqual({
            base: "claude-opus-4-6",
            params: { thinking: "true", context: "200k" },
        });
    });

    it("returns empty params for plain ids", () => {
        expect(parseModelIdBracketParams("gemini-2.5-flash")).toEqual({
            base: "gemini-2.5-flash",
            params: {},
        });
    });
});

describe("buildModelId", () => {
    it("rebuilds bracket model ids", () => {
        expect(buildModelId("gemini-3.1-pro", {})).toBe("gemini-3.1-pro[]");
        expect(buildModelId("claude-opus-4-6", { effort: "high" })).toBe(
            "claude-opus-4-6[effort=high]",
        );
    });
});

describe("buildModelPickerState", () => {
    it("groups advertised variants under one model name", () => {
        const state = buildModelPickerState(
            [
                { modelId: "composer-2.5[]", name: "composer-2.5" },
                {
                    modelId: "composer-2.5[reasoning=high]",
                    name: "composer-2.5",
                },
                { modelId: "gpt-5.4[]", name: "gpt-5.4" },
            ],
            "composer-2.5[reasoning=high]",
        );
        expect(state?.groups.map((g) => g.name)).toEqual([
            "composer-2.5",
            "gpt-5.4",
        ]);
        expect(state?.groups[0]?.variants).toHaveLength(2);
        expect(state?.currentGroupLabel).toBe("Composer 2.5");
    });

    it("uses a single variant when the agent lists one", () => {
        const state = buildModelPickerState(
            [{ modelId: "gemini-3.1-pro[]", name: "gemini-3.1-pro" }],
            "gemini-3.1-pro[]",
        );
        expect(state?.groups[0]?.variants).toHaveLength(1);
    });
});

describe("formatModelDisplayName", () => {
    it("keeps agent-provided human names", () => {
        expect(formatModelDisplayName("Auto", "default[]")).toBe("Auto");
        expect(formatModelDisplayName("Auto (Gemini 3)", "auto-gemini-3")).toBe(
            "Auto (Gemini 3)",
        );
    });

    it("humanizes slug-like names and ids", () => {
        expect(
            formatModelDisplayName(
                "claude-sonnet-4-6",
                "claude-sonnet-4-6[thinking=true]",
            ),
        ).toBe("Claude Sonnet 4-6");
        expect(
            formatModelDisplayName(
                "gemini-3-pro-preview",
                "gemini-3-pro-preview",
            ),
        ).toBe("Gemini 3 Pro Preview");
        expect(
            formatModelDisplayName("gpt-5.4", "gpt-5.4[reasoning=medium]"),
        ).toBe("GPT 5.4");
    });
});

describe("formatVariantLabel", () => {
    it("maps known params to friendly labels", () => {
        expect(formatVariantLabel({ reasoning: "medium" })).toBe(
            "Medium reasoning",
        );
        expect(formatVariantLabel({})).toBe("Default");
    });
});

describe("pickVariantForGroup", () => {
    it("preserves effort when switching model families", () => {
        const nextId = pickVariantForGroup(
            [
                {
                    modelId: "claude-opus-4-6[effort=high]",
                    params: { effort: "high" },
                },
                {
                    modelId: "claude-opus-4-6[effort=medium]",
                    params: { effort: "medium" },
                },
            ],
            { effort: "medium" },
        );
        expect(nextId).toBe("claude-opus-4-6[effort=medium]");
    });

    it("preserves fast mode when switching model families", () => {
        const nextId = pickVariantForGroup(
            [
                { modelId: "gpt-5.4[]", params: {} },
                { modelId: "gpt-5.4[fast=true]", params: { fast: "true" } },
            ],
            { fast: "true" },
        );
        expect(nextId).toBe("gpt-5.4[fast=true]");
    });
});
