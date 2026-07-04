import { describe, expect, it } from "vitest";
import {
    parseAcpAgentSpawnConfig,
    parseAcpAgentsJsonFileContent,
    resolveAuthMethodId,
} from "./agentSpawnConfig";

describe("parseAcpAgentSpawnConfig", () => {
    it("accepts command name and args", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "Gemini",
                command: "gemini",
                args: ["--stdio"],
            }),
        ).toEqual({ name: "Gemini", command: "gemini", args: ["--stdio"] });
    });

    it("defaults args to empty when omitted", () => {
        expect(parseAcpAgentSpawnConfig({ name: "x", command: "y" })).toEqual({
            name: "x",
            command: "y",
            args: [],
        });
    });

    it("filters non-string args", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "x",
                command: "y",
                args: ["a", 1, "b"],
            }),
        ).toEqual({ name: "x", command: "y", args: ["a", "b"] });
    });

    it("parses env with string values only", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "x",
                command: "y",
                env: { FOO: "bar", SKIP: 1 },
            }),
        ).toEqual({ name: "x", command: "y", args: [], env: { FOO: "bar" } });
    });

    it("parses authMethodId when set", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "Cursor",
                command: "agent",
                authMethodId: "cursor_login",
            }),
        ).toEqual({
            name: "Cursor",
            command: "agent",
            args: [],
            authMethodId: "cursor_login",
        });
    });

    it("rejects invalid entries", () => {
        expect(parseAcpAgentSpawnConfig(null)).toBeUndefined();
        expect(parseAcpAgentSpawnConfig({ name: "x" })).toBeUndefined();
        expect(parseAcpAgentSpawnConfig({ command: "y" })).toBeUndefined();
    });
});

describe("resolveAuthMethodId", () => {
    it("returns undefined when no methods are advertised", () => {
        expect(resolveAuthMethodId(undefined)).toBeUndefined();
        expect(resolveAuthMethodId([])).toBeUndefined();
    });

    it("picks the first agent-type method", () => {
        expect(
            resolveAuthMethodId([
                { id: "cursor_login" },
                { id: "other", type: "agent" },
            ]),
        ).toBe("cursor_login");
    });

    it("uses configured id when it matches an agent method", () => {
        expect(
            resolveAuthMethodId([{ id: "a" }, { id: "b", type: "agent" }], "b"),
        ).toBe("b");
    });

    it("throws when configured id does not match", () => {
        expect(() =>
            resolveAuthMethodId([{ id: "cursor_login" }], "missing"),
        ).toThrow(/does not match/);
    });

    it("throws when only non-agent methods exist", () => {
        expect(() =>
            resolveAuthMethodId([{ id: "api-key", type: "env_var" }]),
        ).toThrow(/env_var\/terminal auth/);
    });
});

describe("parseAcpAgentsJsonFileContent", () => {
    it("parses a single agent object as a one-element list", () => {
        expect(
            parseAcpAgentsJsonFileContent({
                name: "Cursor",
                command: "agent",
                args: ["acp"],
            }),
        ).toEqual([{ name: "Cursor", command: "agent", args: ["acp"] }]);
    });

    it("parses a non-empty array of agents", () => {
        expect(
            parseAcpAgentsJsonFileContent([
                { name: "Cursor", command: "agent", args: ["acp"] },
                { name: "Other", command: "other", args: [] },
            ]),
        ).toEqual([
            { name: "Cursor", command: "agent", args: ["acp"] },
            { name: "Other", command: "other", args: [] },
        ]);
    });

    it("returns undefined for empty or invalid input", () => {
        expect(parseAcpAgentsJsonFileContent([])).toBeUndefined();
        expect(parseAcpAgentsJsonFileContent(null)).toBeUndefined();
    });
});
