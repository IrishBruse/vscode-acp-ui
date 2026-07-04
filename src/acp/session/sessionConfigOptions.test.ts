import { describe, expect, it } from "vitest";
import {
    composeModelIdAfterDerivedChange,
    deriveModelParamOptionsFromModelSelect,
    groupedModelChoices,
    modelConfigOption,
    modelParameterOptions,
    resolveAdvertisedModelOptionValue,
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

    it("returns null when the composed model id is not advertised", () => {
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
        expect(next).toBeNull();
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
});
