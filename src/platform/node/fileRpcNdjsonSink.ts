import { createWriteStream, type WriteStream } from "node:fs";
import type {
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../../acp/ports/rpcNdjsonSink";
import { formatAcpRpcNdjsonDebugLine } from "../../acp/ports/rpcNdjsonSink";

/**
 * Append-only NDJSON file sink for standalone / non-VS Code hosts (mirrors
 * {@link VscodeAcpRpcNdjsonSink} file behavior without an output channel).
 */
export class FileAcpRpcNdjsonSink implements AcpRpcNdjsonSink {
    private stream: WriteStream | null = null;

    constructor(private readonly logFilePath: string | null) {}

    get isLoggingEnabled(): boolean {
        return this.logFilePath !== null;
    }

    appendRawNdjsonLine(line: string, context?: AcpRpcNdjsonLineContext): void {
        const formatted = formatAcpRpcNdjsonDebugLine(line, context);
        const s = this.getOrCreateStream();
        if (s !== null) {
            s.write(`${formatted}\n`);
        }
    }

    dispose(): void {
        if (this.stream !== null) {
            this.stream.end();
            this.stream = null;
        }
    }

    private getOrCreateStream(): WriteStream | null {
        if (this.logFilePath === null) {
            return null;
        }
        if (this.stream === null) {
            this.stream = createWriteStream(this.logFilePath, { flags: "a" });
            this.stream.on("error", (err: Error) => {
                console.error("ACP RPC log file write error:", err);
            });
        }
        return this.stream;
    }
}
