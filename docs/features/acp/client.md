# Client

## User facing

ACP UI identifies itself and advertises client capabilities during the `initialize` handshake with each agent.

Today the most visible result is the Cursor model and thinking-level toolbar in the composer when you use the Cursor ACP agent.
Other capability flags (terminals, terminal auth, boolean config options, elicitation) are planned.

Planned: agents will receive `clientInfo` (name, version, title) on every `initialize` so they can identify the ACP UI build.
Users see a clear message when protocol version negotiation fails.

## Implementation

### Capabilities

[buildAcpClientCapabilities](../../../src/acp/infrastructure/acpAgentProcess.ts#L90-L102) builds the `clientCapabilities` object sent on `initialize`.
All agents advertise filesystem read and write support.

For Cursor spawn configs, [isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts) gates `_meta.parameterizedModelPicker: true`.
That unlocks agent-ordered `configOptions` rendered in [ConfigOptionControls](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx).

Remaining Zed parity gaps (terminal, terminal auth, boolean config options, elicitation) are listed in the task checklist.
Do not advertise a capability until the matching client callback exists.

Task: [client-capabilities](../../tasks/client-capabilities.md).
Protocol: [extensibility](../../acp/protocol/extensibility.mdx), [session config options](../../acp/protocol/v1/session-config-options.mdx).

### Initialization metadata

[configureAcpClientInfo](../../../src/extension/activateAcpUiExtension.ts#L22-L31) runs at extension activation.

It sets `clientInfo` from `package.json` via [buildAcpClientInfoFromPackage](../../../src/acp/infrastructure/acpAgentProcess.ts#L115-L133).

[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts#L291-L299) sends it on every `initialize`.

[assertNegotiatedProtocolVersion](../../../src/acp/infrastructure/acpAgentProcess.ts#L148-L157) rejects incompatible agent responses.

It throws [AcpProtocolVersionMismatchError](../../../src/acp/infrastructure/acpAgentProcess.ts#L89-L106).

The error message guides the user to update ACP UI or the agent.

Connect failures surface that message in the chat UI and VS Code notification.

Task: [initialization-metadata](../../tasks/initialization-metadata.md).
Protocol: [initialization](../../acp/protocol/v1/initialization.mdx).
