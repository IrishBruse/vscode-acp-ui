import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUserHomeDir } from "./resolveUserHomeDir";
import { expandTildeInPath, resolveWorkspacePath } from "./resolveWorkspacePath";

describe("expandTildeInPath", () => {
    it("expands ~/ paths with the user home directory", () => {
        expect(expandTildeInPath("~/git/vscode-acp-ui/AGENTS.md")).toBe(
            join(resolveUserHomeDir(), "git/vscode-acp-ui/AGENTS.md"),
        );
    });
});

describe("resolveWorkspacePath", () => {
    it("joins relative paths to the workspace root", () => {
        expect(
            resolveWorkspacePath(
                "webview/acp-ui/src/main.ts",
                "/home/econn/git/vscode-acp-ui",
            ),
        ).toBe("/home/econn/git/vscode-acp-ui/webview/acp-ui/src/main.ts");
    });

    it("keeps absolute paths unchanged", () => {
        expect(
            resolveWorkspacePath(
                "/var/log/syslog",
                "/home/econn/git/vscode-acp-ui",
            ),
        ).toBe("/var/log/syslog");
    });
});
