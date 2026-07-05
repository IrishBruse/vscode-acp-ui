import { createWriteStream, type WriteStream } from "node:fs";
import type { OutputChannel } from "vscode";
import type {
    AcpRpcNdjsonLineContext,
    AcpRpcNdjsonSink,
} from "../../acp/ports/rpcNdjsonSink";

/**
 * VS Code Output channel + append-only NDJSON log file. Replaces module-level singletons
 * with an explicit, disposable recorder owned by the extension activation path.
 */
export class VscodeAcpRpcNdjsonSink implements AcpRpcNdjsonSink {
    private logFileStream: WriteStream | null = null;

    constructor(
        private readonly channel: OutputChannel | null,
        private readonly logFilePath: string | null,
    ) {}

    get isLoggingEnabled(): boolean {
        return this.channel !== null || this.logFilePath !== null;
    }

    appendRawNdjsonLine(
        line: string,
        _context?: AcpRpcNdjsonLineContext,
    ): void {
        if (this.channel !== null) {
            this.channel.appendLine(line);
        }
        const stream = this.getOrCreateLogFileStream();
        if (stream !== null) {
            stream.write(`${line}\n`);
        }
    }

    /** Absolute path of the log file, or null when file logging is disabled. */
    getLogFilePath(): string | null {
        return this.logFilePath;
    }

    dispose(): void {
        if (this.logFileStream !== null) {
            this.logFileStream.end();
            this.logFileStream = null;
        }
    }

    private getOrCreateLogFileStream(): WriteStream | null {
        if (this.logFilePath === null) {
            return null;
        }
        if (this.logFileStream === null) {
            this.logFileStream = createWriteStream(this.logFilePath, {
                flags: "a",
            });
            this.logFileStream.on("error", (err: Error) => {
                console.error("ACP RPC log file write error:", err);
            });
        }
        return this.logFileStream;
    }
}
