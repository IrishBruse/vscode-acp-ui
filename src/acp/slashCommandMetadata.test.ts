import { describe, expect, it } from "vitest";
import {
    compareSlashCommandGroups,
    normalizeSlashCommand,
    normalizeSlashCommandSource,
    parseTrailingParenLabels,
    slashCommandGroupLabel,
} from "./slashCommandMetadata";

describe("parseTrailingParenLabels", () => {
    it("strips trailing parenthetical labels from the end", () => {
        expect(
            parseTrailingParenLabels(
                "Prepare a release by bumping package.json (user skill) (global)",
            ),
        ).toEqual({
            description: "Prepare a release by bumping package.json",
            labels: ["user skill", "global"],
        });
    });

    it("leaves descriptions without trailing labels unchanged", () => {
        expect(parseTrailingParenLabels("Rename chat")).toEqual({
            description: "Rename chat",
            labels: [],
        });
    });
});

describe("normalizeSlashCommandSource", () => {
    it("dedupes explicit source and parsed labels", () => {
        expect(
            normalizeSlashCommandSource("global", ["user skill", "global"]),
        ).toBe("global · user skill");
    });
});

describe("slashCommandGroupLabel", () => {
    it("groups by scope token when multiple labels are present", () => {
        expect(slashCommandGroupLabel("user skill · global")).toBe(
            "user skill",
        );
        expect(slashCommandGroupLabel("global")).toBe("global");
        expect(slashCommandGroupLabel(undefined)).toBe("Built-in");
    });
});

describe("compareSlashCommandGroups", () => {
    it("orders built-in, workspace, user skill, then global", () => {
        const labels = ["global", "Built-in", "workspace", "user skill"].sort(
            compareSlashCommandGroups,
        );
        expect(labels).toEqual([
            "Built-in",
            "workspace",
            "user skill",
            "global",
        ]);
    });
});

describe("normalizeSlashCommand", () => {
    it("returns clean description and merged source", () => {
        expect(
            normalizeSlashCommand({
                name: "release",
                description: "Bump version (user skill) (global)",
            }),
        ).toEqual({
            name: "release",
            description: "Bump version",
            source: "user skill · global",
        });
    });
});
