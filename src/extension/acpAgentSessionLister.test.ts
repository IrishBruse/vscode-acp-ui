import { describe, expect, it } from "vitest";
import {
    sessionInfoLabel,
    sessionInfoSortKey,
    sortSessionInfos,
} from "./acpAgentSessionListFormat";

describe("sessionInfoLabel", () => {
    it("uses title when present", () => {
        expect(
            sessionInfoLabel({
                sessionId: "sess_abc123def456",
                cwd: "/tmp",
                title: "Fix auth flow",
            }),
        ).toBe("Fix auth flow");
    });

    it("falls back to short session id", () => {
        expect(
            sessionInfoLabel({
                sessionId: "sess_abc123def456",
                cwd: "/tmp",
            }),
        ).toBe("Session 23def456");
    });
});

describe("sortSessionInfos", () => {
    it("orders by updatedAt descending", () => {
        const sorted = sortSessionInfos([
            {
                sessionId: "a",
                cwd: "/tmp",
                updatedAt: "2025-10-27T15:30:00Z",
            },
            {
                sessionId: "b",
                cwd: "/tmp",
                updatedAt: "2025-10-29T14:22:15Z",
            },
        ]);
        expect(sorted.map((row) => row.sessionId)).toEqual(["b", "a"]);
    });

    it("treats missing updatedAt as oldest", () => {
        expect(
            sessionInfoSortKey({
                sessionId: "x",
                cwd: "/tmp",
            }),
        ).toBe(0);
    });
});
