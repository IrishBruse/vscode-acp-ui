import type { Uri } from "vscode";
import type {
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../acp/ports/rpcNdjsonSink";
import { appendSessionRpcRecord } from "./acpUiSessionJsonl";

/**
 * Mirrors all ACP stdio JSON-RPC traffic into the session `.acp` file.
 */
export class AcpUiSessionFileRpcSink implements AcpRpcNdjsonSink {
    readonly isLoggingEnabled = true;

    constructor(private readonly sessionFileUri: Uri) {}

    appendRawNdjsonLine(
        line: string,
        _context?: AcpRpcNdjsonLineContext,
    ): void {
        void this.appendLine(line);
    }

    private async appendLine(line: string): Promise<void> {
        let payload: unknown;
        try {
            payload = JSON.parse(line);
        } catch {
            return;
        }
        if (payload === null || typeof payload !== "object") {
            return;
        }

        try {
            await appendSessionRpcRecord(this.sessionFileUri, payload);
        } catch (err: unknown) {
            const detail = err instanceof Error ? err.message : String(err);
            console.warn(
                `[ACP UI] Failed to persist ACP RPC record: ${detail}`,
            );
        }
    }
}
