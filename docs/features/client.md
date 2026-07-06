# Client

## User facing

ACP UI identifies itself and advertises client capabilities during the `initialize` handshake with each agent.

Today the most visible result is the Cursor model and thinking-level toolbar in the composer when you use the Cursor ACP agent.
Other capability flags (terminals, terminal auth, boolean config options, elicitation) are planned.

Planned: agents will receive `clientInfo` (name, version, title) on every `initialize` so they can identify the ACP UI build.
Users will see a clear message when protocol version negotiation fails.

## Implementation

### Capabilities

[buildAcpClientCapabilities](../../src/acp/infrastructure/acpAgentProcess.ts#L90-L102) builds the `clientCapabilities` object sent on `initialize`.
All agents advertise filesystem read and write support.

For Cursor spawn configs, [isCursorAcpAgent](../../src/acp/domain/agentSpawnConfig.ts) gates `_meta.parameterizedModelPicker: true`.
That unlocks agent-ordered `configOptions` rendered in [ConfigOptionControls](../../webview/acp-ui/src/components/ConfigOptionControls.tsx).

Remaining Zed parity gaps (terminal, terminal auth, boolean config options, elicitation) are listed in the task checklist.
Do not advertise a capability until the matching client callback exists.

Task: [client-capabilities](../tasks/client-capabilities.md).
Protocol: [extensibility](../acp/protocol/extensibility.mdx), [session config options](../acp/protocol/v1/session-config-options.mdx).

### Initialization metadata

Not implemented.
`clientInfo` is omitted on `initialize` today.
The task adds fields from `package.json` and surfaces version mismatch errors.

Task: [initialization-metadata](../tasks/initialization-metadata.md).
Protocol: [initialization](../acp/protocol/v1/initialization.mdx).
