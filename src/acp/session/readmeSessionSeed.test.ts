import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReadmeSessionSeedFromJson } from "./readmeSessionSeed";
import { usesAgentOrderedConfigLayout } from "./sessionConfigOptions";

const fixtureRoot = join(import.meta.dirname, "../../../standalone/fixtures");

describe("parseReadmeSessionSeedFromJson", () => {
    it("loads the committed readme fixture seed for composer bootstrap", () => {
        const text = readFileSync(
            join(fixtureRoot, "readme-seed.json"),
            "utf-8",
        );
        const seed = parseReadmeSessionSeedFromJson(text);
        expect(seed.configOptions?.length).toBeGreaterThan(0);
        expect(seed.modelSelection?.availableModels.length).toBeGreaterThan(0);
        expect(seed.modelSelection?.currentModelId).toContain("composer-2");
        expect(
            usesAgentOrderedConfigLayout(
                seed.configOptions !== null
                    ? { options: seed.configOptions }
                    : null,
            ),
        ).toBe(false);
    });
});
