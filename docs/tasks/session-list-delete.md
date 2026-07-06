---
status: not-started
feature: docs/features/sessions.md
---

# Task: Session list and delete (`session/list`, `session/delete`)

## Deliverable

- Call `session/list` when the agent advertises the capability (optional sync with Chats sidebar).
- Call `session/delete` when the user deletes a local chat and the agent advertises delete.

## Why

ACP UI maintains a local VS Code "Chats" list only (`acpUiSessionsStore`).
Deleting a chat removes local metadata but does not call `session/delete`, leaving orphan agent sessions.

## Current behavior

| Area | Today |
| --- | --- |
| Chats list | `acpUiSessionsStore` in workspace state (`acpUi.chats.v2`) |
| `session/list` | Not called |
| Delete chat | Local only, no `session/delete` |

## Key files

| Path | Role |
| --- | --- |
| `src/extension/acpUiSessionsStore.ts` | Local chat list |
| `src/acp/infrastructure/acpAgentProcess.ts` | SDK session methods |
| Chats sidebar / delete command handlers | Wire agent delete |

## Implementation checklist

### `session/list`

- [ ] Detect agent `session/list` capability after `initialize`
- [ ] Optional: merge or display agent sessions in UI (product decision)
- [ ] At minimum: callable for debugging or future sync

### `session/delete`

- [ ] On local chat delete, if capability present and runtime `sessionId` known, call `session/delete`
- [ ] Handle agent errors gracefully (local delete still succeeds)
- [ ] Tests for delete with and without capability

## Definition of done

1. Deleting a local chat notifies the agent when supported.
2. `session/list` is invoked when advertised (UI surfacing optional for v1).

## References

- `docs/acp/protocol/v1/session-list.mdx`
- `docs/acp/protocol/v1/session-delete.mdx`
