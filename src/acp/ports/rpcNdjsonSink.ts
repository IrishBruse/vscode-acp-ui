/**
 * Optional sink for raw NDJSON-RPC lines (stdio transport), used for debugging and support.
 * When {@link isLoggingEnabled} is false, transports should not insert extra stream taps.
 */
export type AcpRpcNdjsonDirection = "toAgent" | "fromAgent";

export type AcpRpcNdjsonLineContext = {
    direction: AcpRpcNdjsonDirection;
    /** Agent display name when the line comes from a configured connection. */
    agentName?: string;
};

const rpcNdjsonDebugFieldSeparator = " | ";

/**
 * Formats one NDJSON-RPC line for extension debug output.
 */
export function formatAcpRpcNdjsonDebugLine(
    line: string,
    context?: AcpRpcNdjsonLineContext,
): string {
    if (context === undefined) {
        return line;
    }
    const fields = [
        ...(context.agentName !== undefined && context.agentName.length > 0
            ? [context.agentName]
            : []),
        context.direction,
        line,
    ];
    return `// ${fields.join(rpcNdjsonDebugFieldSeparator)}`;
}

export interface AcpRpcNdjsonSink {
    readonly isLoggingEnabled: boolean;
    appendRawNdjsonLine(line: string, context?: AcpRpcNdjsonLineContext): void;
}

/** No-op sink for tests or hosts that do not surface RPC traffic. */
export class NullAcpRpcNdjsonSink implements AcpRpcNdjsonSink {
    readonly isLoggingEnabled = false;
    appendRawNdjsonLine(
        _line: string,
        _context?: AcpRpcNdjsonLineContext,
    ): void {}
}

/** Forwards each NDJSON line to every configured sink. */
export class CompositeAcpRpcNdjsonSink implements AcpRpcNdjsonSink {
    constructor(private readonly sinks: AcpRpcNdjsonSink[]) {}

    get isLoggingEnabled(): boolean {
        return this.sinks.some((sink) => sink.isLoggingEnabled);
    }

    appendRawNdjsonLine(line: string, context?: AcpRpcNdjsonLineContext): void {
        for (const sink of this.sinks) {
            if (sink.isLoggingEnabled) {
                sink.appendRawNdjsonLine(line, context);
            }
        }
    }
}
