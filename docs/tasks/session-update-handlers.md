---
status: not-started
feature: docs/features/sessions.md
---

# Task: Unhandled `session/update` types

## Deliverable

Handle v1 `session/update` variants that currently no-op in `sessionUpdateToWebviewMessages`:

| `sessionUpdate` | UX goal |
| --- | --- |
| `user_message_chunk` | Stream user message echo during `session/load` replay | Done in `sessionUpdateMapping.ts` |
| `current_mode_update` | Agent / plan / ask mode changes |
| `config_option_update` | Session config options (successor to modes) |
| `session_info_update` | Title and metadata sync |
| `usage_update` | Token / cost / context window usage |

## Why

Missing handlers mean no mode picker, no usage meter, no agent-driven title sync, and incomplete load replay UX.

## Current behavior

`user_message_chunk` maps to `appendUserText` in `sessionUpdateMapping.ts`.
The other listed types still fall through to the default branch (no-op).

## Key files

| Path | Role |
| --- | --- |
| `src/acp/mapping/sessionUpdateMapping.ts` | `session/update` -> webview messages |
| `src/acp/protocol/extensionHostMessages.ts` | Add message types if needed |
| `webview/acp-ui/` | Composer mode, usage display, title sync |

## Implementation checklist

- [x] `user_message_chunk` -> append user text in trace (pairs with [session-resume.md](./session-resume.md))
- [ ] `current_mode_update` -> state + composer mode indicator / picker
- [ ] `config_option_update` -> config UI or composer integration
- [ ] `session_info_update` -> update chat title in sidebar / tab
- [ ] `usage_update` -> usage meter or status bar (design TBD)
- [ ] Unit tests per update type with fixture payloads
- [ ] `npm run verify` passes

## Definition of done

1. Each listed `sessionUpdate` type produces visible UI or persisted state change.
2. Load replay shows user message chunks, not only agent chunks.

## References

- `docs/acp/protocol/v1/session-modes.mdx`
- `docs/acp/protocol/v1/session-config-options.mdx`
- `docs/acp/protocol/v1/session-list.mdx`
- `docs/acp/protocol/v1/prompt-turn.mdx`
- `docs/acp/schema/v1/schema.json` (`SessionUpdate` oneOf)
