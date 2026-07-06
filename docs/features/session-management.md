# Session Management

## User facing

Planned: deleting a chat will notify the agent when it supports `session/delete`, so agent-side sessions are not left orphaned.
Optional future work may sync the Chats sidebar with agent `session/list` results.

Today the Chats list is local to VS Code workspace state only.

## Implementation

Not implemented for agent RPC.
Local chat list and delete live in [acpUiSessionsStore.ts](../../src/extension/acpUiSessionsStore.ts).

SDK helpers [supportsListSessions](../../src/acp/infrastructure/acpAgentProcess.ts#L252-L257), [listSessions](../../src/acp/infrastructure/acpAgentProcess.ts#L269-L279), and [supportsDeleteSessions](../../src/acp/infrastructure/acpAgentProcess.ts#L263-L267) exist on [AcpAgentProcess](../../src/acp/infrastructure/acpAgentProcess.ts).
They are not wired to UI delete flows yet.

Task: [session-list-delete](../tasks/session-list-delete.md).
Protocol: [session list](../acp/protocol/v1/session-list.mdx), [session delete](../acp/protocol/v1/session-delete.mdx).
