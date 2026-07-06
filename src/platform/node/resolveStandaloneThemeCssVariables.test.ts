import { describe, expect, it } from "vitest";
import {
    buildStandaloneThemeCssVariables,
    parseVscodeUserSettings,
} from "./resolveStandaloneThemeCssVariables";

describe("parseVscodeUserSettings", () => {
    it("reads color customizations, token rules, and markdown inline editor colors", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorTheme": "Empty Dark Theme",
            "workbench.colorCustomizations": {
                "editor.background": "#282c34",
                "editor.foreground": "#abb2bf"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "heading.1.markdown entity.name.section.markdown",
                        "settings": { "foreground": "#D19A66" }
                    }
                ]
            },
            "markdownInlineEditor.colors.heading1": "#D19A66",
            "markdownInlineEditor.colors.heading2": "#E06C75",
            "markdownInlineEditor.colors.inlineCode": "#C678DD",
            "editor.fontFamily": "Cascadia Code",
            "editor.fontSize": 12
        }`);

        expect(settings.colorTheme).toBe("Empty Dark Theme");
        expect(settings.colorCustomizations["editor.background"]).toBe(
            "#282c34",
        );
        expect(settings.tokenColorCustomizations?.textMateRules).toHaveLength(
            1,
        );
        expect(settings.markdownInlineEditorColors.heading2).toBe("#E06C75");
        expect(settings.markdownInlineEditorColors.inlineCode).toBe("#C678DD");
        expect(settings.editorFontFamily).toBe("Cascadia Code");
        expect(settings.editorFontSize).toBe(12);
    });
});

describe("buildStandaloneThemeCssVariables", () => {
    it("prefers markdownInlineEditor heading colors over token rules", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorCustomizations": {
                "editor.foreground": "#abb2bf",
                "markdown.extension.editor.codeSpan.border": "#636d8344"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "heading.1.markdown entity.name.section.markdown",
                        "settings": { "foreground": "#000000" }
                    }
                ]
            },
            "markdownInlineEditor.colors.heading1": "#D19A66",
            "markdownInlineEditor.colors.heading2": "#E06C75",
            "markdownInlineEditor.colors.heading3": "#61AFEF",
            "markdownInlineEditor.colors.heading4": "#C678DD",
            "markdownInlineEditor.colors.inlineCode": "#C678DD"
        }`);

        const vars = buildStandaloneThemeCssVariables(settings, []);
        expect(vars["--acp-markdown-h1-foreground"]).toBe("#D19A66");
        expect(vars["--acp-markdown-h2-foreground"]).toBe("#E06C75");
        expect(vars["--acp-markdown-h3-foreground"]).toBe("#61AFEF");
        expect(vars["--acp-markdown-h4-foreground"]).toBe("#C678DD");
        expect(vars["--acp-markdown-inline-code-foreground"]).toBe("#C678DD");
        expect(vars["--vscode-editor-foreground"]).toBe("#abb2bf");
    });

    it("prefers markdownInlineEditor inlineCode over markup.inline.raw token rules", () => {
        const settings = parseVscodeUserSettings(`{
            "workbench.colorCustomizations": {
                "editor.foreground": "#abb2bf"
            },
            "editor.tokenColorCustomizations": {
                "textMateRules": [
                    {
                        "scope": "markup.inline.raw.markdown",
                        "settings": { "foreground": "#98C379" }
                    }
                ]
            },
            "markdownInlineEditor.colors.inlineCode": "#C678DD"
        }`);

        const vars = buildStandaloneThemeCssVariables(settings, []);
        expect(vars["--acp-markdown-inline-code-foreground"]).toBe("#C678DD");
    });
});
