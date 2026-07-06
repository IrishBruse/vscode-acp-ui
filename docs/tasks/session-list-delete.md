---
status: done
feature: docs/features/acp/sessions.md
---

# Task: Session list and delete (`session/list`, `session/delete`)

## Deliverable

- Call `session/list` when the agent advertises the capability (optional sync with Chats sidebar).
- Call `session/delete` when the user deletes a local chat and the agent advertises delete.

## Why

ACP UI maintains a local VS Code "Chats" list only (`acpUiSessionsStore`).
Deleting a chat removes local metadata but does not call `session/delete`, leaving orphan agent sessions.

## Implementation checklist

### `session/list`

- [x] Detect agent `session/list` capability after `initialize`
- [x] Optional: merge or display agent sessions in UI (product decision)
- [x] At minimum: callable for debugging or future sync

### `session/delete`

- [x] On local chat delete, if capability present and runtime `sessionId` known, call `session/delete`
- [x] Handle agent errors gracefully (local delete still succeeds)
- [x] Tests for delete with and without capability

## Definition of done

1. Deleting a local chat notifies the agent when supported.
2. `session/list` is invoked when advertised (UI surfacing optional for v1).

## References

- `docs/acp/protocol/v1/session-list.mdx`
- `docs/acp/protocol/v1/session-delete.mdx`
