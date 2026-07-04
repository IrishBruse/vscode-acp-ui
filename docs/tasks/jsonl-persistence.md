# Task: JSONL persistence + `historyReplay`

**Status:** Not started  
**Priority:** P0  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

Wire `acpUiSessionJsonl` append and `historyReplay` into `acpUiPanel` so local transcript files back the chat UI when agent `session/load` is unavailable.

## Why

The repo defines client-owned JSONL session files (`acpUi/session/1` schema) as an alternative or supplement to ACP `session/load` replay.
Today `appendSessionEvent` is only used in tests.
`historyReplay` exists in protocol types but is unused in the live extension path.

## Current behavior

| Area | Today |
| --- | --- |
| `src/extension/acpUiSessionJsonl.ts` | Header + replay events defined |
| `acpUiPanel.ts` | No imports of `appendSessionEvent` outside tests |
| `historyReplay` | Type exists, not sent to webview on open |

## Key files

| Path | Role |
| --- | --- |
| `src/extension/acpUiSessionJsonl.ts` | JSONL schema, append, read |
| `src/extension/acpUiPanel.ts` | Panel lifecycle, webview init |
| `src/extension/acpUiSessionsStore.ts` | UI session metadata |
| `webview/acp-ui/` | Consume `historyReplay` on init |

## Implementation checklist

- [ ] Append events to JSONL on prompt turns, updates, and session lifecycle
- [ ] On chat open, read JSONL and send `historyReplay` to webview when agent load is skipped or fails
- [ ] Align JSONL transcript with UI session UUID (not only agent `sessionId`)
- [ ] Unit tests for append + replay round-trip
- [ ] Document relationship to `session/load` (agent replay vs client-owned transcript)
- [ ] `npm run verify` passes

## Definition of done

1. Closing and reopening a chat restores the local transcript from JSONL when `session/load` is not used.
2. JSONL files grow during normal chat use without breaking existing sessions.
3. `historyReplay` populates the webview trace on open.

## References

- `docs/ACP_DIVERGENCE_REPORT.md` (Local session model vs ACP session model)
