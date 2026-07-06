# Sessions

## User facing

ACP UI manages chat sessions end to end: creating chats, resuming conversations, persisting history locally, and reacting to agent-driven session updates.

When you reopen a chat, ACP UI restores the conversation when the agent supports `session/load` and the chat has a stored agent session id.
Agent-side context and replayed messages appear in the trace without starting a blank session.
If resume fails or the agent does not support load, ACP UI falls back to a new agent session and local JSONL replay when available.

Each chat is backed by a local transcript file.
Closing and reopening the chat restores your message history from disk when agent-side resume is unavailable or fails.

Planned: deleting a chat will notify the agent when it supports `session/delete`.
The chat UI will also react to more agent-driven updates such as mode changes, config option updates, title sync, and usage meters.
User message chunks during `session/load` replay already appear in the trace.

## Implementation

### Resume (`session/load`)

The UI session id (`.acp` header UUID) is separate from the runtime session id (`header.runtimeSessionId`) used for ACP `session/load`.

[shouldLoadRuntimeSession](../../../src/acp/session/acpSessionBridge.test.ts) decides load vs new on connect.
[supportsLoadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L259-L261) reads `loadSession` from agent capabilities.
[loadSession](../../../src/acp/infrastructure/acpAgentProcess.ts#L298-L311) calls the SDK with cwd and `mcpServers` (today empty).

[loadSessionWithAuthRetry](../../../src/acp/session/acpSessionBridge.ts#L914-L927) handles auth-required errors during load.
Replay `session/update` events map through [sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts).
That includes `user_message_chunk` to user text in the trace.

[acpUiSessionController.ts](../../../src/extension/acpUiSessionController.ts) passes `runtimeSessionId` on connect and clears it on chat reset.
[acpUiSessionsStore.ts](../../../src/extension/acpUiSessionsStore.ts) persists the runtime id in the session header.

Tasks: [session-resume](../../tasks/session-resume.md).
Protocol: [session setup](../../acp/protocol/v1/session-setup.mdx).

### Local persistence (JSONL)

ACP UI uses client-owned JSONL session files (`acpUi/session/1` schema) as a supplement to ACP `session/load`.

[acpUiSessionJsonl.ts](../../../src/extension/acpUiSessionJsonl.ts) handles append and read.
[acpUiSessionController.ts](../../../src/extension/acpUiSessionController.ts) appends events during chat and sends `historyReplay` before `init` on open.
[main.ts](../../../webview/acp-ui/src/main.ts) applies `historyReplay` before the webview mounts.

When `session/load` runs successfully, JSONL is cleared first and agent replay is authoritative.
On load failure, saved JSONL restores to disk and replays in the webview.

Task: [jsonl-persistence](../../tasks/jsonl-persistence.md).

### List and delete

Not implemented for agent RPC.
Local chat list and delete live in [acpUiSessionsStore.ts](../../../src/extension/acpUiSessionsStore.ts).

[supportsListSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L252-L257) exists on [AcpAgentProcess](../../../src/acp/infrastructure/acpAgentProcess.ts).
[listSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L269-L279) is also implemented.
[supportsDeleteSessions](../../../src/acp/infrastructure/acpAgentProcess.ts#L263-L267) is also implemented.

They are not wired to UI delete flows yet.

Task: [session-list-delete](../../tasks/session-list-delete.md).
Protocol: [session list](../../acp/protocol/v1/session-list.mdx), [session delete](../../acp/protocol/v1/session-delete.mdx).

### Session updates

[sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts) maps `session/update` notifications to webview messages.
`user_message_chunk` maps to append user text (shipped).

Still no-op in the default branch: `current_mode_update`, `config_option_update`, `session_info_update`, and `usage_update`.

Task: [session-update-handlers](../../tasks/session-update-handlers.md).
Protocol: [session modes](../../acp/protocol/v1/session-modes.mdx), [session config options](../../acp/protocol/v1/session-config-options.mdx).
See also [prompt turn](../../acp/protocol/v1/prompt-turn.mdx).
