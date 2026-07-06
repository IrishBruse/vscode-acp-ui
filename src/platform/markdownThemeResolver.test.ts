import { describe, expect, it } from "vitest";
import {
    applyMarkdownInlineEditorColors,
    buildMarkdownThemeCssVariables,
    buildMarkdownTypographyCssVariables,
    buildSyntaxHighlightCssVariables,
    type ColorThemeJson,
    mergeColorThemeJson,
    pickWebviewMarkdownThemeVariables,
    tokenColorRulesFromCustomizations,
} from "./markdownThemeResolver";

const darkModernLikeTheme: ColorThemeJson = {
    colors: {
        "editor.foreground": "#D4D4D4",
        "textPreformat.foreground": "#D0D0D0",
        "textPreformat.background": "#3C3C3C",
        "textPreformat.border": "#454545",
    },
    tokenColors: [
        {
            scope: "markup.heading",
            settings: { foreground: "#569cd6", fontStyle: "bold" },
        },
        {
            scope: "heading.2.markdown entity.name.section.markdown",
            settings: { foreground: "#4ec9b0" },
        },
        {
            scope: "markup.inline.raw",
            settings: { foreground: "#ce9178" },
        },
    ],
};

describe("buildMarkdownThemeCssVariables", () => {
    it("uses markup.heading and per-level heading token colors", () => {
        const vars = buildMarkdownThemeCssVariables(darkModernLikeTheme);
        expect(vars["--acp-markdown-h1-foreground"]).toBe("#569cd6");
        expect(vars["--acp-markdown-h2-foreground"]).toBe("#4ec9b0");
        expect(vars["--acp-markdown-h3-foreground"]).toBe("#569cd6");
        expect(vars["--acp-markdown-inline-code-foreground"]).toBe("#ce9178");
        expect(vars["--acp-markdown-inline-code-border"]).toBe("#454545");
    });

    it("maps fenced-code syntax token colors", () => {
        const vars = buildSyntaxHighlightCssVariables(darkModernLikeTheme);
        expect(vars["--vscode-symbolIcon-keywordForeground"]).toBe("#c586c0");
        expect(vars["--vscode-stringForeground"]).toBe("#ce9178");
        expect(vars["--acp-code-token-comment-foreground"]).toBe("#6a9955");
    });

    it("merges user token color customizations after theme rules", () => {
        const customRules = tokenColorRulesFromCustomizations(
            {
                textMateRules: [
                    {
                        scope: "heading.1.markdown entity.name.section.markdown",
                        settings: { foreground: "#ff0000" },
                    },
                ],
            },
            "Dark Modern",
        );
        const vars = buildMarkdownThemeCssVariables(
            darkModernLikeTheme,
            customRules,
        );
        expect(vars["--acp-markdown-h1-foreground"]).toBe("#ff0000");
        expect(vars["--acp-markdown-h2-foreground"]).toBe("#4ec9b0");
    });
});

describe("buildMarkdownTypographyCssVariables", () => {
    it("maps markdown preview font settings to css variables", () => {
        expect(
            buildMarkdownTypographyCssVariables({
                fontSizePx: 14,
                lineHeight: 1.6,
            }),
        ).toEqual({
            "--acp-markdown-font-size": "14px",
            "--acp-markdown-line-height": "1.6",
        });
    });
});

describe("mergeColorThemeJson", () => {
    it("layers included theme colors and token rules", () => {
        const merged = mergeColorThemeJson(
            {
                colors: { "editor.foreground": "#111111" },
                tokenColors: [
                    {
                        scope: "markup.heading",
                        settings: { foreground: "#222222" },
                    },
                ],
            },
            {
                colors: { "textPreformat.background": "#333333" },
                tokenColors: [
                    {
                        scope: "markup.inline.raw",
                        settings: { foreground: "#444444" },
                    },
                ],
            },
        );
        expect(merged.colors).toEqual({
            "editor.foreground": "#111111",
            "textPreformat.background": "#333333",
        });
        expect(merged.tokenColors).toHaveLength(2);
    });
});

describe("applyMarkdownInlineEditorColors", () => {
    it("overrides token-derived inline code foreground", () => {
        const vars = buildMarkdownThemeCssVariables(darkModernLikeTheme);
        expect(vars["--acp-markdown-inline-code-foreground"]).toBe("#ce9178");
        applyMarkdownInlineEditorColors(vars, { inlineCode: "#C678DD" });
        expect(vars["--acp-markdown-inline-code-foreground"]).toBe("#C678DD");
    });
});

describe("pickWebviewMarkdownThemeVariables", () => {
    it("keeps heading and syntax variables for webview init", () => {
        const picked = pickWebviewMarkdownThemeVariables({
            "--vscode-editor-background": "#282c34",
            "--acp-markdown-h1-foreground": "#D19A66",
            "--acp-markdown-h2-foreground": "#E06C75",
            "--vscode-symbolIcon-keywordForeground": "#C678DD",
            "": "skip",
        });
        expect(picked["--acp-markdown-h1-foreground"]).toBe("#D19A66");
        expect(picked["--acp-markdown-h2-foreground"]).toBe("#E06C75");
        expect(picked["--vscode-symbolIcon-keywordForeground"]).toBe("#C678DD");
        expect(picked["--vscode-editor-background"]).toBeUndefined();
    });
});
