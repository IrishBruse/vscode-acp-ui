import { describe, expect, it } from "vitest";
import { AcpAgentProcess } from "./acpAgentProcess";

type CapabilityProbe = {
    supportsListSessions(): boolean;
    supportsLoadSession(): boolean;
    supportsDeleteSessions(): boolean;
};

function probeFromInit(init: {
    agentCapabilities?: {
        loadSession?: boolean;
        sessionCapabilities?: {
            list?: Record<string, never>;
            delete?: Record<string, never>;
        };
    };
}): CapabilityProbe {
    const process = new AcpAgentProcess({
        config: { name: "Test", command: "echo", args: [] },
        requestPermission: async () => ({
            outcome: { outcome: "cancelled" },
        }),
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
    });
    (
        process as unknown as {
            initResponse: typeof init;
        }
    ).initResponse = init;
    return process;
}

describe("AcpAgentProcess session capabilities", () => {
    it("detects list, load, and delete support from initialize", () => {
        const process = probeFromInit({
            agentCapabilities: {
                loadSession: true,
                sessionCapabilities: {
                    list: {},
                    delete: {},
                },
            },
        });
        expect(process.supportsListSessions()).toBe(true);
        expect(process.supportsLoadSession()).toBe(true);
        expect(process.supportsDeleteSessions()).toBe(true);
    });

    it("returns false when capabilities are absent", () => {
        const process = probeFromInit({});
        expect(process.supportsListSessions()).toBe(false);
        expect(process.supportsLoadSession()).toBe(false);
        expect(process.supportsDeleteSessions()).toBe(false);
    });
});
