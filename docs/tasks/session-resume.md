# Task: Session resume (`session/load`)

**Status:** Not started  
**Priority:** P0  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

On chat open, when the agent advertises `loadSession` and the UI session has a stored runtime `sessionId`, call `session/load` instead of always `session/new`.
Map replay `session/update` events (especially `user_message_chunk`) into the webview trace.

## Why

Reopening a chat today starts a **new** agent session.
Users lose agent conversation context even when a runtime `sessionId` is persisted on the UI record.

## Current behavior

| Area | Today |
| --- | --- |
| Connect | Always `session/new` in `AcpAgentProcess` |
| Runtime ID | Stored as `sessionId` / `runtimeSessionId` on UI session record |
| `session/load` | Never called |
| `user_message_chunk` | No-op in `sessionUpdateToWebviewMessages` |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `newSession`, SDK session setup |
| `src/acp/session/acpSessionBridge.ts` | Session bridge on connect |
| `src/acp/mapping/sessionUpdateMapping.ts` | `session/update` -> webview |
| `src/extension/acpUiSessionController.ts` | Chat open / reconnect |
| `src/extension/acpUiSessionsStore.ts` | UI session + runtime `sessionId` |

## Implementation checklist

- [ ] On chat open, read stored runtime `sessionId` from UI session record
- [ ] If agent capability includes `loadSession` and ID exists, call `loadSession` instead of `newSession`
- [ ] Handle `user_message_chunk` during replay (see also [session-update-handlers.md](./session-update-handlers.md))
- [ ] Fall back to `session/new` when no runtime ID or capability missing
- [ ] Tests for load vs new decision and replay mapping
- [ ] `npm run verify` passes

## Definition of done

1. Reopening a chat with a stored runtime `sessionId` and a `loadSession`-capable agent restores agent-side context.
2. Replay updates appear in the trace (user and agent messages as appropriate).
3. Fresh chats and agents without `loadSession` still use `session/new`.

## References

- `docs/acp/protocol/v1/session-setup.mdx`
- `docs/cursor-extensions/acp.md` (step 3: `session/new` or `session/load`)
