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
            parseModelIdBracketParams("composer-2.5[fast=true,reasoning=high]"),
        ).toEqual({
            base: "composer-2.5",
            params: { fast: "true", reasoning: "high" },
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
        expect(buildModelId("composer-2.5", { fast: "true" })).toBe(
            "composer-2.5[fast=true]",
        );
        expect(buildModelId("composer-2.5", {})).toBe("composer-2.5[]");
    });
});

describe("buildModelPickerState", () => {
    it("groups variants under one model name", () => {
        const state = buildModelPickerState(
            [
                { modelId: "composer-2.5[]", name: "composer-2.5" },
                { modelId: "composer-2.5[fast=true]", name: "composer-2.5" },
                {
                    modelId: "composer-2.5[max=true]",
                    name: "composer-2.5",
                },
                { modelId: "gpt-5.4[]", name: "gpt-5.4" },
            ],
            "composer-2.5[fast=true]",
        );
        expect(state?.showVariantPicker).toBe(true);
        expect(state?.currentVariants.map((v) => v.label)).toEqual([
            "Default",
            "Fast",
            "Max",
        ]);
        expect(state?.groups.map((g) => g.name)).toEqual([
            "composer-2.5",
            "gpt-5.4",
        ]);
        expect(state?.groups.map((g) => g.label)).toEqual([
            "Composer 2.5",
            "GPT 5.4",
        ]);
        expect(state?.currentGroupLabel).toBe("Composer 2.5");
    });

    it("hides the variant picker for a single variant", () => {
        const state = buildModelPickerState(
            [{ modelId: "gemini-3.1-pro[]", name: "gemini-3.1-pro" }],
            "gemini-3.1-pro[]",
        );
        expect(state?.showVariantPicker).toBe(false);
    });

    it("does not synthesize a default fast toggle when the agent omits it", () => {
        const state = buildModelPickerState(
            [
                {
                    modelId: "composer-2.5[fast=true]",
                    name: "Composer 2.5",
                },
            ],
            "composer-2.5[fast=true]",
        );
        expect(state?.showVariantPicker).toBe(false);
        expect(state?.currentVariants.map((v) => v.modelId)).toEqual([
            "composer-2.5[fast=true]",
        ]);
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
        expect(formatVariantLabel({ fast: "true" })).toBe("Fast");
        expect(formatVariantLabel({ reasoning: "medium" })).toBe(
            "Medium reasoning",
        );
    });
});

describe("pickVariantForGroup", () => {
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
