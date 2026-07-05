import { describe, expect, it } from "vitest";
import { shouldLoadRuntimeSession } from "./acpSessionBridge";

describe("shouldLoadRuntimeSession", () => {
    it("loads when a runtime id exists and the agent supports loadSession", () => {
        expect(shouldLoadRuntimeSession("runtime-1", true)).toBe(true);
        expect(shouldLoadRuntimeSession("  runtime-1  ", true)).toBe(true);
    });

    it("creates a new session without a runtime id", () => {
        expect(shouldLoadRuntimeSession(undefined, true)).toBe(false);
        expect(shouldLoadRuntimeSession("", true)).toBe(false);
        expect(shouldLoadRuntimeSession("   ", true)).toBe(false);
    });

    it("creates a new session when loadSession is not advertised", () => {
        expect(shouldLoadRuntimeSession("runtime-1", false)).toBe(false);
    });
});
