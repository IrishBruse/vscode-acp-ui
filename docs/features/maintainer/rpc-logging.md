# RPC logging

## User facing

For debugging ACP protocol traffic, open the **ACP UI RPC** output channel from the command palette (**Show ACP RPC Log**).
Each line is one NDJSON RPC message with direction (`toAgent` or `fromAgent`) and agent name metadata.

This is a developer diagnostics surface.
End users typically only need it when troubleshooting agent connectivity.

## Implementation

### VS Code output channel

[activateAcpUiExtension](../../../src/extension/activateAcpUiExtension.ts#L23-L46) creates the `ACP UI RPC` output channel.
It registers `ib-acp-ui.showAcpRpcLog`.
[VscodeAcpRpcNdjsonSink](../../../src/platform/vscode/vscodeRpcNdjsonSink.ts) appends formatted lines.

### Stdio tap

When logging is enabled, [createNdjsonRpcLogTap](../../../src/acp/infrastructure/acpAgentProcess.ts#L27-L63) wraps agent stdin and stdout.
This happens inside [AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts).
Complete NDJSON lines are forwarded to the sink without altering the wire protocol.

[formatAcpRpcNdjsonDebugLine](../../../src/acp/ports/rpcNdjsonSink.ts#L19-L38) formats each record.

### Standalone file sink

In standalone mode, [FileAcpRpcNdjsonSink](../../../src/platform/node/fileRpcNdjsonSink.ts) writes to a file controlled by `ACP_RPC_LOG`.
See [standalone](./standalone.md).

### Composite and null sinks

[CompositeAcpRpcNdjsonSink](../../../src/acp/ports/rpcNdjsonSink.ts#L50) fans out to multiple sinks.
[NullAcpRpcNdjsonSink](../../../src/acp/ports/rpcNdjsonSink.ts#L41) disables logging when `isLoggingEnabled` is false.
