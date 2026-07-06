import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteSession = vi.fn();
const mockDispose = vi.fn();
const mockSupportsDeleteSessions = vi.fn();
const mockStart = vi.fn();

vi.mock("../acp/infrastructure/acpAgentProcess", () => ({
    AcpAgentProcess: class {
        start = mockStart;
        supportsDeleteSessions = mockSupportsDeleteSessions;
        deleteSession = mockDeleteSession;
        dispose = mockDispose;
        authenticate = vi.fn();
    },
}));

vi.mock("./extensionServices", () => ({
    getAcpUiExtensionActivation: () => ({
        rpcNdjsonSink: {
            isLoggingEnabled: false,
            appendRawNdjsonLine: () => {},
            dispose: () => {},
        },
        outputChannel: { appendLine: () => {} },
    }),
}));

vi.mock("../platform/vscode/defaultHostRuntime", () => ({
    createDefaultAcpSessionHostRuntime: () => ({
        hostFilesystem: {
            readTextFile: async () => "",
            writeTextFile: async () => {},
        },
        rpcNdjsonSink: {
            isLoggingEnabled: false,
            appendRawNdjsonLine: () => {},
            dispose: () => {},
        },
        getWorkspaceRoot: () => "/tmp",
    }),
}));

import { deleteAgentSession } from "./acpAgentSessionLister";
import {
    sessionInfoLabel,
    sessionInfoSortKey,
    sortSessionInfos,
} from "./acpAgentSessionListFormat";

const testAgentConfig = { name: "Test", command: "echo", args: [] };

describe("deleteAgentSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStart.mockResolvedValue({});
        mockDeleteSession.mockResolvedValue(undefined);
    });

    it("calls session/delete when the agent advertises delete", async () => {
        mockSupportsDeleteSessions.mockReturnValue(true);
        const result = await deleteAgentSession(
            testAgentConfig,
            "sess-runtime-1",
        );
        expect(result).toEqual({ supported: true, deleted: true });
        expect(mockDeleteSession).toHaveBeenCalledWith("sess-runtime-1");
        expect(mockDispose).toHaveBeenCalled();
    });

    it("skips session/delete when the agent does not advertise delete", async () => {
        mockSupportsDeleteSessions.mockReturnValue(false);
        const result = await deleteAgentSession(
            testAgentConfig,
            "sess-runtime-1",
        );
        expect(result).toEqual({ supported: false, deleted: false });
        expect(mockDeleteSession).not.toHaveBeenCalled();
        expect(mockDispose).toHaveBeenCalled();
    });
});

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
