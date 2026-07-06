# Client Capabilities

## User facing

ACP UI tells each agent what the client can do during the `initialize` handshake.
Today the most visible result is the Cursor model and thinking-level toolbar in the composer when you use the Cursor ACP agent.

Other capability flags (terminals, terminal auth, boolean config options, elicitation) are planned and tracked in the client-capabilities task.

## Implementation

[buildAcpClientCapabilities](../../src/acp/infrastructure/acpAgentProcess.ts#L90-L102) builds the `clientCapabilities` object sent on `initialize`.
All agents advertise filesystem read and write support.

For Cursor spawn configs, [isCursorAcpAgent](../../src/acp/domain/agentSpawnConfig.ts) gates `_meta.parameterizedModelPicker: true`.
That unlocks agent-ordered `configOptions` rendered in [ConfigOptionControls](../../webview/acp-ui/src/components/ConfigOptionControls.tsx).

Remaining Zed parity gaps (terminal, terminal auth, boolean config options, `clientInfo`, elicitation) are listed in the task checklist.
Do not advertise a capability until the matching client callback exists.

Task: [client-capabilities](../tasks/client-capabilities.md).
Protocol: [extensibility](../acp/protocol/extensibility.mdx), [session config options](../acp/protocol/v1/session-config-options.mdx).
