import { describe, expect, it } from "vitest";
import {
    buildComposerAutocompleteState,
    wrapIndex,
} from "./composerAutocomplete";

describe("buildComposerAutocompleteState", () => {
    it("builds slash suggestions and filters by prefix", () => {
        const state = buildComposerAutocompleteState({
            draft: "/re",
            caret: 3,
            slashCommands: [
                { name: "rename", description: "Rename chat" },
                { name: "reset", description: "Reset session" },
                { name: "clear", description: "Clear trace" },
            ],
            workspaceFiles: [],
        });
        expect(state?.mode).toBe("slash");
        expect(state?.items.map((item) => item.primary)).toEqual([
            "/rename",
            "/reset",
        ]);
    });

    it("splits trailing skill labels and groups slash commands", () => {
        const state = buildComposerAutocompleteState({
            draft: "/",
            caret: 1,
            slashCommands: [
                {
                    name: "release",
                    description: "Bump version (user skill) (global)",
                },
                {
                    name: "docs",
                    description: "Align docs (user skill) (workspace)",
                },
                { name: "rename", description: "Rename chat" },
            ],
            workspaceFiles: [],
        });
        expect(state?.groups.map((group) => group.label)).toEqual([
            undefined,
            "workspace",
            "user skill",
        ]);
        expect(state?.items.find((item) => item.primary === "/release")).toMatchObject({
            secondary: "Bump version",
            source: "user skill · global",
        });
    });

    it("builds file suggestions for @ query", () => {
        const state = buildComposerAutocompleteState({
            draft: "read @chat",
            caret: "read @chat".length,
            slashCommands: [],
            workspaceFiles: ["src/chatReducer.ts", "src/main.ts"],
        });
        expect(state?.mode).toBe("file");
        expect(state?.items[0]?.insertText).toBe("@src/chatReducer.ts ");
    });
});

describe("wrapIndex", () => {
    it("wraps up and down navigation", () => {
        expect(wrapIndex(-1, 3)).toBe(2);
        expect(wrapIndex(3, 3)).toBe(0);
    });
});
