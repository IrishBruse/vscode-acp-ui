import { describe, expect, it } from "vitest";
import {
    isUsablePlanAccentColor,
    parseCssRgb,
    PLAN_COLOR_FALLBACK,
    resolvePlanModeIndicatorColor,
} from "./sessionModeIndicatorTheme";

describe("parseCssRgb", () => {
    it("parses hex and rgb strings", () => {
        expect(parseCssRgb("#d18616")).toEqual([209, 134, 22]);
        expect(parseCssRgb("rgb(157, 157, 157)")).toEqual([157, 157, 157]);
    });
});

describe("isUsablePlanAccentColor", () => {
    it("rejects gray description-like colors", () => {
        expect(
            isUsablePlanAccentColor(
                "rgb(157, 157, 157)",
                "rgb(157, 157, 157)",
            ),
        ).toBe(false);
        expect(
            isUsablePlanAccentColor("#9D9D9D", "rgb(157, 157, 157)"),
        ).toBe(false);
    });

    it("accepts saturated orange accents", () => {
        expect(
            isUsablePlanAccentColor(
                "rgb(209, 134, 22)",
                "rgb(157, 157, 157)",
            ),
        ).toBe(true);
    });
});

describe("resolvePlanModeIndicatorColor", () => {
    it("skips muted theme aliases and prefers warning orange", () => {
        const resolved = resolvePlanModeIndicatorColor(
            (varName) => {
                if (varName === "--vscode-editorWarning-foreground") {
                    return "rgb(209, 134, 22)";
                }
                if (varName === "--vscode-charts-orange") {
                    return "rgb(157, 157, 157)";
                }
                return undefined;
            },
            "rgb(157, 157, 157)",
        );
        expect(resolved).toBe("rgb(209, 134, 22)");
    });

    it("falls back when every candidate is muted", () => {
        const resolved = resolvePlanModeIndicatorColor(
            () => "rgb(157, 157, 157)",
            "rgb(157, 157, 157)",
        );
        expect(resolved).toBe(PLAN_COLOR_FALLBACK);
    });
});
