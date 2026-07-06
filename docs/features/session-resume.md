# Session Resume

## User facing

When you reopen a chat, ACP UI restores the conversation when the agent supports `session/load` and the chat has a stored agent session id.
Agent-side context and replayed messages appear in the trace without starting a blank session.

If resume fails or the agent does not support load, ACP UI falls back to a new agent session and local JSONL replay when available.

## Implementation

The UI session id (`.acp` header UUID) is separate from the runtime session id (`header.runtimeSessionId`) used for ACP `session/load`.

[shouldLoadRuntimeSession](../../src/acp/session/acpSessionBridge.test.ts) decides load vs new on connect.
[supportsLoadSession](../../src/acp/infrastructure/acpAgentProcess.ts#L259-L261) reads `loadSession` from agent capabilities.
[loadSession](../../src/acp/infrastructure/acpAgentProcess.ts#L298-L311) calls the SDK with cwd and `mcpServers` (today empty).

[loadSessionWithAuthRetry](../../src/acp/session/acpSessionBridge.ts#L914-L927) handles auth-required errors during load.
Replay `session/update` events map through [sessionUpdateMapping.ts](../../src/acp/mapping/sessionUpdateMapping.ts).
That includes `user_message_chunk` to user text in the trace.

[acpUiSessionController.ts](../../src/extension/acpUiSessionController.ts) passes `runtimeSessionId` on connect and clears it on chat reset.
[acpUiSessionsStore.ts](../../src/extension/acpUiSessionsStore.ts) persists the runtime id in the session header.

Task: [session-resume](../tasks/session-resume.md).
Protocol: [session setup](../acp/protocol/v1/session-setup.mdx).
