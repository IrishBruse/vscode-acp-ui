import { describe, expect, it } from "vitest";
import {
    composeModelIdAfterDerivedChange,
    deriveModelParamOptionsFromModelSelect,
    groupedModelChoices,
    modelConfigOption,
    modelConfigSummaryLabel,
    modelParameterOptions,
    modelSelectOptionFromModels,
    pickModelOptionForFamily,
    resolveAdvertisedModelOptionValue,
    resolveBestAdvertisedModelOption,
    sessionConfigOptionsFromAgent,
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
        expect(derived.map((row) => row.name)).toEqual(["Context", "Effort"]);
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
            type: "boolean",
            currentValue: true,
        });
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
        expect(next).toBe("gemini-3.1-pro[]");
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
            false,
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
