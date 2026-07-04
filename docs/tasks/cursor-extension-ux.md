# Task: Cursor extension UX

**Status:** Not started  
**Priority:** P2  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

Improve webview handling of Cursor `cursor/*` extension methods and notifications beyond minimal trace lines.

| Item | Today | Target |
| --- | --- | --- |
| `cursor/create_plan` `phases` | Type allows `phases` in messages, but bridge does not forward | Forward `phases` to webview dialog |
| `cursor/update_todos` | Plan-style trace lines | Dedicated todo panel |
| `cursor/task` | Single trace line (`Subagent task: ...`) | Richer subagent task display |
| `cursor/generate_image` | Text line with path | Inline image render |
| `toolCallId` on payloads | Internal `cursor-ask-question-N` ids | Surface agent `toolCallId` in bridge request IDs |

Already solid:

- `cursor/ask_question` -- full dialog (`CursorAskQuestionDialog`)
- `cursor/create_plan` -- dialog without phases grouping

## Key files

| Path | Role |
| --- | --- |
| `src/acp/session/acpSessionBridge.ts` | `handleExtensionMethod`, notifications |
| `src/acp/protocol/extensionHostMessages.ts` | Webview message types |
| `webview/acp-ui/src/components/` | Dialogs, trace, new todo/image/task UI |
| `docs/cursor-extensions/extensions.md` | Upstream field definitions |

## Implementation checklist

- [ ] Forward `phases` from `cursor/create_plan` in `AcpSessionBridge.handleExtensionMethod`
- [ ] Update `CursorCreatePlanDialog` to render phased todos when present
- [ ] `cursor/update_todos` -> dedicated todo list component (not plan trace)
- [ ] `cursor/task` -> expandable subagent card or structured trace block
- [ ] `cursor/generate_image` -> `Read`/render image from path in webview (security: workspace paths only)
- [ ] Use agent `toolCallId` in bridge correlation ids where provided
- [ ] Tests for bridge parsing and webview message shapes
- [ ] `npm run verify` passes

## Definition of done

1. Plan dialog shows phased todos when the agent sends `phases`.
2. Todo updates have a distinct UI from generic plan traces.
3. Generated images appear inline when path is readable.
4. Extension request/response correlation can use agent `toolCallId`.

## References

- `docs/cursor-extensions/extensions.md`
- `docs/cursor-extensions/acp.md`
