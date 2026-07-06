import { describe, expect, it } from "vitest";
import { formatAcpRpcNdjsonDebugLine } from "./rpcNdjsonSink";

describe("formatAcpRpcNdjsonDebugLine", () => {
    it("returns the raw line when context is omitted", () => {
        const line = '{"jsonrpc":"2.0","method":"initialize","id":1}';
        expect(formatAcpRpcNdjsonDebugLine(line)).toBe(line);
    });

    it("prefixes direction and agent name for debug output", () => {
        const line = '{"jsonrpc":"2.0","method":"session/prompt","id":2}';
        expect(
            formatAcpRpcNdjsonDebugLine(line, {
                agentName: "Cursor",
                direction: "toAgent",
            }),
        ).toBe(`// Cursor | toAgent | ${line}`);
    });

    it("omits an empty agent name", () => {
        const line = '{"jsonrpc":"2.0","id":0,"result":{}}';
        expect(
            formatAcpRpcNdjsonDebugLine(line, {
                agentName: "",
                direction: "fromAgent",
            }),
        ).toBe(`// fromAgent | ${line}`);
    });
});
