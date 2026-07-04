import { describe, expect, it } from "vitest";
import { formatPathWithTilde } from "./pathDisplay";

describe("formatPathWithTilde", () => {
    const home = "/home/econn";

    it("shortens paths under home", () => {
        expect(
            formatPathWithTilde(
                "/home/econn/git/markdown-inline-editor-vscode/docs",
                home,
            ),
        ).toBe("~/git/markdown-inline-editor-vscode/docs");
    });

    it("returns ~ for home itself", () => {
        expect(formatPathWithTilde("/home/econn", home)).toBe("~");
    });

    it("leaves paths outside home unchanged", () => {
        expect(formatPathWithTilde("/var/log/syslog", home)).toBe(
            "/var/log/syslog",
        );
    });
});
