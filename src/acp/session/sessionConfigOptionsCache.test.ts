import { describe, expect, it } from "vitest";
import type { AcpUiSessionConfigOption } from "./sessionConfigOptions";
import {
    readCachedComposerSeed,
    readCachedModelParamOptions,
    readCachedSessionConfigOptions,
    readCachedSessionModels,
    sessionConfigOptionsInReplayEvents,
    writeCachedModelParamOptions,
    writeCachedSessionConfigOptions,
    writeCachedSessionModels,
} from "./sessionConfigOptionsCache";

const sampleOptions: AcpUiSessionConfigOption[] = [
    {
        configId: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "claude-opus-4-8",
        options: [
            { value: "claude-opus-4-8", name: "Opus 4.8" },
            { value: "claude-sonnet-4-6", name: "Sonnet 4.6" },
        ],
    },
];

describe("sessionConfigOptionsCache", () => {
    it("stores and returns a deep clone per agent name", () => {
        writeCachedSessionConfigOptions("cursor", sampleOptions);
        const cached = readCachedSessionConfigOptions("cursor");
        expect(cached).toEqual(sampleOptions);
        expect(cached).not.toBe(sampleOptions);
        cached?.[0]?.options.push({ value: "x", name: "X" });
        expect(readCachedSessionConfigOptions("cursor")).toEqual(sampleOptions);
    });

    it("detects sessionConfigOptions replay events", () => {
        expect(
            sessionConfigOptionsInReplayEvents([
                { type: "submit", body: "hi" },
                { type: "sessionConfigOptions", options: sampleOptions },
            ]),
        ).toBe(true);
        expect(
            sessionConfigOptionsInReplayEvents([
                { type: "submit", body: "hi" },
            ]),
        ).toBe(false);
    });

    it("stores model param options separately by model family", () => {
        const params: AcpUiSessionConfigOption[] = [
            {
                configId: "context_size",
                name: "Context",
                type: "select",
                currentValue: "300k",
                options: [{ value: "300k", name: "300K" }],
            },
        ];
        writeCachedModelParamOptions("cursor", "Opus 4.8", params);
        expect(readCachedModelParamOptions("cursor", "Opus 4.8")).toEqual(
            params,
        );
    });

    it("prefers full config seed over legacy model list seed", () => {
        writeCachedSessionModels("cursor", {
            currentModelId: "legacy-model",
            availableModels: [{ modelId: "legacy-model", name: "Legacy" }],
        });
        writeCachedSessionConfigOptions("cursor", sampleOptions);
        expect(readCachedComposerSeed("cursor")).toEqual({
            configOptions: sampleOptions,
            modelSelection: null,
        });
    });

    it("falls back to cached model list when config options are absent", () => {
        const models = {
            currentModelId: "legacy-model",
            availableModels: [{ modelId: "legacy-model", name: "Legacy" }],
        };
        writeCachedSessionModels("legacy-agent", models);
        expect(readCachedComposerSeed("legacy-agent")).toEqual({
            configOptions: null,
            modelSelection: models,
        });
        expect(readCachedSessionModels("legacy-agent")).toEqual(models);
    });
});
