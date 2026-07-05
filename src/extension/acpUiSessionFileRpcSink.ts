import type { Uri } from "vscode";
import type {
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../acp/ports/rpcNdjsonSink";
import { appendSessionRpcRecord } from "./acpUiSessionJsonl";
import type { AcpUiSessionRecordDebug } from "./acpUiSessionJsonlFormat";

type PendingRpcRequest = {
    method: string;
    startedAt: number;
};

/**
 * Mirrors ACP stdio RPC traffic into the session `.acp` file with debug comment lines.
 */
export class AcpUiSessionFileRpcSink implements AcpRpcNdjsonSink {
    readonly isLoggingEnabled = true;
    private readonly pendingRequests = new Map<
        string | number,
        PendingRpcRequest
    >();

    constructor(private readonly sessionFileUri: Uri) {}

    appendRawNdjsonLine(line: string, context?: AcpRpcNdjsonLineContext): void {
        void this.appendLine(line, context);
    }

    private async appendLine(
        line: string,
        context?: AcpRpcNdjsonLineContext,
    ): Promise<void> {
        let payload: Record<string, unknown>;
        try {
            const parsed: unknown = JSON.parse(line);
            if (parsed === null || typeof parsed !== "object") {
                return;
            }
            payload = parsed as Record<string, unknown>;
        } catch {
            return;
        }

        const debug: AcpUiSessionRecordDebug = {
            direction: context?.direction,
        };
        const method =
            typeof payload.method === "string" ? payload.method : undefined;
        const id = payload.id;

        if (method !== undefined && context?.direction === "toAgent") {
            debug.method = method;
            if (
                id !== undefined &&
                (typeof id === "string" || typeof id === "number")
            ) {
                this.pendingRequests.set(id, {
                    method,
                    startedAt: Date.now(),
                });
            }
        } else if (
            id !== undefined &&
            (typeof id === "string" || typeof id === "number") &&
            ("result" in payload || "error" in payload)
        ) {
            const pending = this.pendingRequests.get(id);
            if (pending !== undefined) {
                debug.method = pending.method;
                debug.durationMs = Date.now() - pending.startedAt;
                this.pendingRequests.delete(id);
            }
        } else if (method !== undefined) {
            debug.method = method;
        }

        try {
            await appendSessionRpcRecord(this.sessionFileUri, payload, debug);
        } catch {
            // Best-effort debug logging; never break the agent connection.
        }
    }
}
