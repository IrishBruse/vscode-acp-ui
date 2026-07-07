# Agents

## User facing

ACP UI talks to one or more ACP-capable agent processes that you configure in settings.
Each entry has a display name, executable, optional args, and optional environment variables.
Set `authMethodId` when the agent advertises multiple auth methods.

Default settings include **Cursor** (`agent acp`) and **Gemini** (`gemini --acp`).

The **Chats** sidebar shows an agent picker.
The selected agent is used for new chats and for the agent-backed session list when the agent supports `session/list`.
Each open chat remembers which agent it was created with via the session file header.

## Implementation

### Settings parsing

[getAcpAgentConfigsFromSettings](../../../src/acp/config/vscodeSettingsAgents.ts#L12-L22) reads `ib-acp-ui.agents` from VS Code configuration.
[parseAcpAgentSpawnConfig](../../../src/acp/domain/agentSpawnConfig.ts) validates each entry.

[isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts) detects Cursor spawn configs for capability and UI gates.

### Active agent selection

[initializeAcpUiActiveAgent](../../../src/extension/acpUiActiveAgent.ts#L13-L15) binds global state.
[getActiveAgentConfig](../../../src/extension/acpUiActiveAgent.ts#L20-L35) returns the stored name or the first configured agent.
[setActiveAgentName](../../../src/extension/acpUiActiveAgent.ts#L38-L43) persists the sidebar picker choice.

[pickAcpAgentConfig](../../../src/extension/acpUiAgentPicker.ts#L11-L32) shows a quick pick when creating a chat with multiple agents configured.
[selectActiveAgent](../../../src/extension/acpUiSessionsView.ts) command updates the active agent for the Chats view.

### Per-session agent binding

Session file headers store `agentName`.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L88-L93) resolves the agent config when a chat opens.
[setAcpUiSessionAgentName](../../../src/extension/acpUiSessionsStore.ts) updates the header when the user switches agents on a new chat.

### Process spawn

[AcpAgentProcess.start](../../../src/acp/infrastructure/acpAgentProcess.ts) spawns the configured command with workspace `cwd`.
It runs `initialize` and manages the stdio NDJSON connection.

Related: [authentication](../acp/authentication.md), [client](../acp/client.md).
Planned: [agent-registry](../acp/agent-registry.md).
