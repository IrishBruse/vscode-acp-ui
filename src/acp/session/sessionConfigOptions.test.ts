import { describe, expect, it } from "vitest";
import {
    composeModelIdAfterDerivedChange,
    configOptionDisplayValue,
    configOptionsSummaryLabel,
    deriveModelParamOptionsFromModelSelect,
    groupedModelChoices,
    modelConfigOption,
    modelConfigSummaryLabel,
    modelParameterOptions,
    modelSelectOptionFromModels,
    pickModelOptionForFamily,
    resolveAdvertisedModelOptionValue,
    resolveBestAdvertisedModelOption,
    resolveModelConfigWireValue,
    sessionConfigOptionsFromAgent,
    usesAgentOrderedConfigLayout,
} from "./sessionConfigOptions";

describe("sessionConfigOptionsFromAgent", () => {
    it("normalizes select and boolean options", () => {
        const state = sessionConfigOptionsFromAgent([
            {
                id: "mode",
                name: "Mode",
                category: "mode",
                type: "select",
                currentValue: "agent",
                options: [{ value: "agent", name: "Agent" }],
            },
            {
                id: "fast_mode",
                name: "Fast Mode",
                category: "model_config",
                type: "boolean",
                currentValue: false,
            },
        ]);
        expect(state?.options).toHaveLength(2);
        expect(state?.options[1]).toMatchObject({
            type: "boolean",
            currentValue: false,
        });
    });
});

describe("usesAgentOrderedConfigLayout", () => {
    it("returns true when the agent advertises mode and model_config options", () => {
        const state = sessionConfigOptionsFromAgent([
            {
                id: "mode",
                name: "Mode",
                category: "mode",
                type: "select",
                currentValue: "agent",
                options: [{ value: "agent", name: "Agent" }],
            },
            {
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "claude-opus-4-8",
                options: [
                    { value: "claude-opus-4-8", name: "Opus 4.8" },
                    { value: "claude-sonnet-4-6", name: "Sonnet 4.6" },
                ],
            },
            {
                id: "context",
                name: "Context",
                category: "model_config",
                type: "select",
                currentValue: "300k",
                options: [
                    { value: "200k", name: "200K" },
                    { value: "300k", name: "300K" },
                ],
            },
        ]);
        expect(usesAgentOrderedConfigLayout(state)).toBe(true);
    });

    it("returns false for bracket-encoded model variants without other categories", () => {
        const state = sessionConfigOptionsFromAgent([
            {
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "claude-opus-4-6[effort=high]",
                options: [
                    {
                        value: "claude-opus-4-6[effort=high]",
                        name: "claude-opus-4-6",
                    },
                    {
                        value: "claude-opus-4-6[effort=medium]",
                        name: "claude-opus-4-6",
                    },
                ],
            },
        ]);
        expect(usesAgentOrderedConfigLayout(state)).toBe(false);
    });
});

describe("configOptionDisplayValue", () => {
    it("formats boolean and select values for toolbar labels", () => {
        expect(
            configOptionDisplayValue({
                configId: "fast",
                name: "Fast",
                category: "model_config",
                type: "boolean",
                currentValue: true,
            }),
        ).toBe("On");
        expect(
            configOptionDisplayValue({
                configId: "mode",
                name: "Mode",
                category: "mode",
                type: "select",
                currentValue: "agent",
                options: [{ value: "agent", name: "Agent" }],
            }),
        ).toBe("Agent");
    });

    it("builds a locked composer summary", () => {
        expect(
            configOptionsSummaryLabel([
                {
                    configId: "mode",
                    name: "Mode",
                    category: "mode",
                    type: "select",
                    currentValue: "agent",
                    options: [{ value: "agent", name: "Agent" }],
                },
                {
                    configId: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-opus-4-8",
                    options: [{ value: "claude-opus-4-8", name: "Opus 4.8" }],
                },
            ]),
        ).toBe("Agent \u00b7 Opus 4.8");
    });
});

describe("deriveModelParamOptionsFromModelSelect", () => {
    it("derives context and effort selectors from model option values", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
            options: [
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    value: "claude-opus-4-6[thinking=true,context=1m,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=medium,fast=false]",
                    name: "claude-opus-4-6",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.map((row) => row.name)).toEqual([
            "Context",
            "Effort",
            "Thinking",
        ]);
        expect(
            derived
                .find((row) => row.name === "Context")
                ?.options.map((row) => row.name),
        ).toEqual(["1M", "200K"]);
    });

    it("derives Fast as a boolean when off and on variants are advertised", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-2.5[fast=true]",
            options: [
                { value: "composer-2.5[]", name: "composer-2.5" },
                { value: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived).toHaveLength(1);
        expect(derived[0]).toMatchObject({
            configId: "_derived:fast",
            name: "Fast",
            type: "select",
            currentValue: "true",
        });
        expect(derived[0]?.type === "select" ? derived[0].options : []).toEqual(
            [
                { value: "false", name: "Off" },
                { value: "true", name: "On" },
            ],
        );
    });

    it("derives Fast from a single fast=true variant when no off variant is advertised", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-2.5[fast=true]",
            options: [
                { value: "composer-2.5[fast=true]", name: "composer-2.5" },
                {
                    value: "gpt-5.4[reasoning=medium,context=272k,fast=false]",
                    name: "gpt-5.4",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived).toHaveLength(1);
        expect(derived[0]).toMatchObject({
            configId: "_derived:fast",
            name: "Fast",
            type: "select",
            currentValue: "true",
        });
        expect(derived[0]?.type === "select" ? derived[0].options : []).toEqual(
            [
                { value: "false", name: "Off" },
                { value: "true", name: "On" },
            ],
        );
    });

    it("does not derive Fast for composer families without a fast=true sibling", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-1.5[]",
            options: [{ value: "composer-1.5[]", name: "composer-1.5" }],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.some((row) => row.configId === "_derived:fast")).toBe(
            false,
        );
    });

    it("does not derive Fast when all siblings share fast=false", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
            options: [
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    value: "claude-opus-4-6[thinking=true,context=1m,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.some((row) => row.configId === "_derived:fast")).toBe(
            false,
        );
    });
});

describe("composeModelIdAfterDerivedChange", () => {
    it("composes a new model id for derived effort changes", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
            options: [
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=medium,fast=false]",
                    name: "claude-opus-4-6",
                },
            ],
        };
        const next = composeModelIdAfterDerivedChange(
            modelOption,
            "_derived:effort",
            "medium",
        );
        expect(next).toBe(
            "claude-opus-4-6[thinking=true,context=200k,effort=medium,fast=false]",
        );
    });

    it("falls back to the best advertised sibling when exact combo is missing", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "gemini-3.1-pro[]",
            options: [
                {
                    value: "gemini-3.1-pro[]",
                    name: "gemini-3.1-pro",
                },
            ],
        };
        const next = composeModelIdAfterDerivedChange(
            modelOption,
            "_derived:effort",
            "high",
        );
        expect(next).toBe("gemini-3.1-pro[effort=high]");
    });

    it("composes fast=false by dropping the fast param when absent is used", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-2.5[fast=true]",
            options: [
                { value: "composer-2.5[]", name: "composer-2.5" },
                { value: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
        };
        const next = composeModelIdAfterDerivedChange(
            modelOption,
            "_derived:fast",
            false,
        );
        expect(next).toBe("composer-2.5[]");
    });

    it("composes fast=false when only the fast=true variant is advertised", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-2.5[fast=true]",
            options: [
                { value: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
        };
        const next = composeModelIdAfterDerivedChange(
            modelOption,
            "_derived:fast",
            false,
        );
        expect(next).toBe("composer-2.5[]");
    });
});

describe("resolveAdvertisedModelOptionValue", () => {
    it("matches by param signature when bracket order differs", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "default[]",
            options: [
                {
                    value: "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
            ],
        };
        expect(
            resolveAdvertisedModelOptionValue(
                modelOption,
                "claude-opus-4-6[context=200k,effort=high,fast=false,thinking=true]",
            ),
        ).toBe(
            "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
        );
    });
});

describe("groupedModelChoices", () => {
    it("deduplicates model families by display name", () => {
        const modelOption = modelConfigOption(
            sessionConfigOptionsFromAgent([
                {
                    id: "model",
                    name: "Model",
                    category: "model",
                    type: "select",
                    currentValue: "claude-opus-4-6[effort=high]",
                    options: [
                        {
                            value: "claude-opus-4-6[effort=high]",
                            name: "claude-opus-4-6",
                        },
                        {
                            value: "claude-opus-4-6[effort=medium]",
                            name: "claude-opus-4-6",
                        },
                    ],
                },
            ]),
        );
        expect(modelOption).toBeDefined();
        if (modelOption === undefined) {
            return;
        }
        expect(groupedModelChoices(modelOption)).toHaveLength(1);
    });
});

describe("modelParameterOptions", () => {
    it("merges explicit model_config rows with derived fallbacks", () => {
        const state = sessionConfigOptionsFromAgent([
            {
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue:
                    "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
                options: [
                    {
                        value: "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
                        name: "claude-opus-4-8",
                    },
                ],
            },
            {
                id: "context_size",
                name: "Context Size",
                category: "model_config",
                type: "select",
                currentValue: "200k",
                options: [
                    { value: "200k", name: "200K" },
                    { value: "1m", name: "1M" },
                ],
            },
        ]);
        const params = modelParameterOptions(state);
        expect(params.some((row) => row.configId === "context_size")).toBe(
            true,
        );
        expect(params.some((row) => row.configId === "_derived:context")).toBe(
            false,
        );
        expect(params.some((row) => row.configId === "_derived:effort")).toBe(
            true,
        );
    });

    it("prefers explicit model_config rows over derived ones", () => {
        const state = sessionConfigOptionsFromAgent([
            {
                id: "model",
                name: "Model",
                category: "model",
                type: "select",
                currentValue: "claude-opus-4-6[effort=high]",
                options: [
                    {
                        value: "claude-opus-4-6[effort=high]",
                        name: "claude-opus-4-6",
                    },
                    {
                        value: "claude-opus-4-6[effort=medium]",
                        name: "claude-opus-4-6",
                    },
                ],
            },
            {
                id: "context_size",
                name: "Context Size",
                category: "model_config",
                type: "select",
                currentValue: "200k",
                options: [
                    { value: "200k", name: "200K" },
                    { value: "1m", name: "1M" },
                ],
            },
        ]);
        const params = modelParameterOptions(state);
        expect(params.some((row) => row.configId === "context_size")).toBe(
            true,
        );
        expect(params.some((row) => row.configId === "_derived:effort")).toBe(
            true,
        );
    });

    it("derives params from legacy model selection when config options are absent", () => {
        const params = modelParameterOptions(null, {
            currentModelId: "composer-2.5[fast=true]",
            availableModels: [
                { modelId: "composer-2.5[]", name: "composer-2.5" },
                { modelId: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
        });
        expect(params.some((row) => row.configId === "_derived:fast")).toBe(
            true,
        );
    });
});

describe("pickModelOptionForFamily", () => {
    it("preserves fast mode when switching model families", () => {
        const modelOption = modelSelectOptionFromModels({
            currentModelId: "gpt-5.4[fast=true]",
            availableModels: [
                { modelId: "gpt-5.4[]", name: "gpt-5.4" },
                { modelId: "gpt-5.4[fast=true]", name: "gpt-5.4" },
                { modelId: "composer-2.5[]", name: "composer-2.5" },
                { modelId: "composer-2.5[fast=true]", name: "composer-2.5" },
            ],
        });
        expect(
            pickModelOptionForFamily(modelOption, "composer-2.5", {
                fast: "true",
            }),
        ).toBe("composer-2.5[fast=true]");
    });
});

describe("resolveBestAdvertisedModelOption", () => {
    it("picks the closest sibling for partial param matches", () => {
        const modelOption = modelSelectOptionFromModels({
            currentModelId:
                "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
            availableModels: [
                {
                    modelId:
                        "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    modelId:
                        "claude-opus-4-6[thinking=true,context=200k,effort=medium,fast=false]",
                    name: "claude-opus-4-6",
                },
            ],
        });
        expect(
            resolveBestAdvertisedModelOption(modelOption, "claude-opus-4-6", {
                thinking: "true",
                context: "200k",
                effort: "max",
                fast: "false",
            }),
        ).toBe(
            "claude-opus-4-6[thinking=true,context=200k,effort=high,fast=false]",
        );
    });
});

describe("modelConfigSummaryLabel", () => {
    it("joins active select and boolean params", () => {
        expect(
            modelConfigSummaryLabel([
                {
                    configId: "context_size",
                    name: "Context",
                    category: "model_config",
                    type: "select",
                    currentValue: "200k",
                    options: [
                        { value: "200k", name: "200K" },
                        { value: "1m", name: "1M" },
                    ],
                },
                {
                    configId: "fast_mode",
                    name: "Fast",
                    category: "model_config",
                    type: "boolean",
                    currentValue: true,
                },
            ]),
        ).toBe("200K \u00b7 Fast");
    });
});

describe("deriveModelParamOptionsFromModelSelect family scope", () => {
    it("pools scalar params within a model line but not across unrelated families", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
            options: [
                {
                    value: "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-8",
                },
                {
                    value: "claude-opus-4-6[thinking=true,context=1m,effort=medium,fast=false]",
                    name: "claude-opus-4-6",
                },
                {
                    value: "gpt-5.4[reasoning=medium,context=272k,fast=false]",
                    name: "gpt-5.4",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.map((row) => row.configId)).toEqual([
            "_derived:context",
            "_derived:effort",
            "_derived:thinking",
        ]);
        expect(derived.some((row) => row.configId === "_derived:fast")).toBe(
            false,
        );
    });

    it("derives opus controls from known fallbacks when only one variant is advertised", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
            options: [
                {
                    value: "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-8",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.map((row) => row.configId)).toEqual([
            "_derived:context",
            "_derived:effort",
            "_derived:thinking",
        ]);
    });

    it("does not derive claude params for gpt models", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue:
                "gpt-5.5[reasoning=medium,context=272k,fast=false,effort=high]",
            options: [
                {
                    value: "gpt-5.5[reasoning=medium,context=272k,fast=false,effort=high]",
                    name: "gpt-5.5",
                },
                {
                    value: "claude-opus-4-8[thinking=true,context=200k,effort=high,fast=false]",
                    name: "claude-opus-4-8",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.some((row) => row.configId === "_derived:context")).toBe(
            false,
        );
        expect(derived.some((row) => row.configId === "_derived:effort")).toBe(
            false,
        );
        expect(
            derived.some((row) => row.configId === "_derived:thinking"),
        ).toBe(false);
        expect(derived.some((row) => row.configId === "_derived:fast")).toBe(
            false,
        );
    });

    it("derives only family-local fast for composer", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "composer-2.5[fast=true]",
            options: [
                { value: "composer-2.5[]", name: "composer-2.5" },
                { value: "composer-2.5[fast=true]", name: "composer-2.5" },
                {
                    value: "gpt-5.4[reasoning=medium,context=272k,fast=false]",
                    name: "gpt-5.4",
                },
            ],
        };
        const derived = deriveModelParamOptionsFromModelSelect(modelOption);
        expect(derived.map((row) => row.configId)).toEqual(["_derived:fast"]);
        if (derived[0]?.type === "select") {
            expect(derived[0].options.map((row) => row.name)).toEqual([
                "Off",
                "On",
            ]);
        }
    });
});

describe("resolveModelConfigWireValue", () => {
    it("returns the composed id when no advertised sibling matches", () => {
        const modelOption = {
            configId: "model",
            name: "Model",
            category: "model",
            type: "select" as const,
            currentValue: "gemini-3.1-pro[]",
            options: [
                {
                    value: "gemini-3.1-pro[]",
                    name: "gemini-3.1-pro",
                },
            ],
        };
        expect(
            resolveModelConfigWireValue(
                modelOption,
                "gemini-3.1-pro[effort=high]",
            ),
        ).toBe("gemini-3.1-pro[effort=high]");
    });
});
