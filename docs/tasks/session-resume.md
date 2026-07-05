# Task: Session resume (`session/load`)

**Status:** Done  
**Priority:** P0  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

On chat open, when the agent advertises `loadSession` and the UI session has a stored runtime `sessionId`, call `session/load` instead of always `session/new`.
Map replay `session/update` events (especially `user_message_chunk`) into the webview trace.

## Implementation

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `loadSession`, `supportsLoadSession` |
| `src/acp/session/acpSessionBridge.ts` | `shouldLoadRuntimeSession`, connect load vs new, load failure fallback |
| `src/acp/mapping/sessionUpdateMapping.ts` | `user_message_chunk` -> `appendUserText` |
| `src/extension/acpUiSessionController.ts` | Passes `runtimeSessionId` on connect, clears id on reset |
| `src/extension/acpUiSessionsStore.ts` | Persists `runtimeSessionId` in the `.acp` header |

## Behavior

| Situation | Connect path |
| --- | --- |
| No stored runtime id | `session/new` |
| Runtime id, no `loadSession` | `session/new`, JSONL replay after connect |
| Runtime id + `loadSession` | `session/load`, agent replay in trace |
| `session/load` fails | Restore JSONL, fall back to `session/new` |
| User resets chat | Clear runtime id, then `session/new` |

## Definition of done

1. Reopening a chat with a stored runtime `sessionId` and a `loadSession`-capable agent restores agent-side context.
2. Replay updates appear in the trace (user and agent messages as appropriate).
3. Fresh chats and agents without `loadSession` still use `session/new`.

## References

- `docs/acp/protocol/v1/session-setup.mdx`
- `docs/cursor-extensions/acp.md` (step 3: `session/new` or `session/load`)
