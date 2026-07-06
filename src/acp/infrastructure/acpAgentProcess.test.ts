import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
    AcpAgentProcess,
    AcpProtocolVersionMismatchError,
    assertNegotiatedProtocolVersion,
    buildAcpClientInfoFromPackage,
} from "./acpAgentProcess";

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

describe("buildAcpClientInfoFromPackage", () => {
    it("maps package.json fields to clientInfo", () => {
        expect(
            buildAcpClientInfoFromPackage({
                name: "ib-acp-ui",
                version: "0.4.0",
                displayName: "ACP UI",
            }),
        ).toEqual({
            name: "ib-acp-ui",
            version: "0.4.0",
            title: "ACP UI",
        });
    });

    it("falls back when fields are missing", () => {
        expect(buildAcpClientInfoFromPackage({})).toEqual({
            name: "ib-acp-ui",
            version: "0.0.0",
            title: "ACP UI",
        });
    });
});

describe("assertNegotiatedProtocolVersion", () => {
    it("accepts the supported protocol version", () => {
        expect(() =>
            assertNegotiatedProtocolVersion({
                protocolVersion: acp.PROTOCOL_VERSION,
                agentCapabilities: {},
            }),
        ).not.toThrow();
    });

    it("throws a user-facing error when versions differ", () => {
        expect(() =>
            assertNegotiatedProtocolVersion({
                protocolVersion: acp.PROTOCOL_VERSION + 1,
                agentCapabilities: {},
            }),
        ).toThrow(AcpProtocolVersionMismatchError);
        try {
            assertNegotiatedProtocolVersion({
                protocolVersion: 0,
                agentCapabilities: {},
            });
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(AcpProtocolVersionMismatchError);
            const mismatch = err as AcpProtocolVersionMismatchError;
            expect(mismatch.negotiatedVersion).toBe(0);
            expect(mismatch.supportedVersion).toBe(acp.PROTOCOL_VERSION);
            expect(mismatch.message).toContain("Update the agent");
        }
    });
});
