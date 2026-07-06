---
status: done
feature: docs/features/sessions.md
---

# Task: JSONL persistence + `historyReplay`

## Deliverable

Wire `acpUiSessionJsonl` append and `historyReplay` into the session editor so local transcript files back the chat UI when agent `session/load` is unavailable.

## Why

The repo defines client-owned JSONL session files (`acpUi/session/1` schema) as an alternative or supplement to ACP `session/load` replay.
The extension appends replay events during chat, and restores them on open when agent replay does not run.

## Relationship to `session/load`

| Situation | Transcript source |
| --- | --- |
| Fresh chat, no runtime id | Live events append to JSONL, reopen replays via `historyReplay` |
| Stored runtime id + agent `loadSession` | JSONL cleared before load, agent `session/update` replay is authoritative |
| `session/load` fails | Saved JSONL events restore to disk and replay in the webview |
| Stored runtime id, no `loadSession` | `session/new`, plus JSONL `historyReplay` after connect |

The **UI session id** (`header.id`, UUID) names the `.acp` file.
The **runtime session id** (`header.runtimeSessionId`) is the agent `sessionId` used only for ACP resume.

## Implementation

| Path | Role |
| --- | --- |
| `src/extension/acpUiSessionJsonl.ts` | JSONL schema, append, read |
| `src/extension/acpUiSessionController.ts` | Append on outbound messages, `historyReplay` on open, load fallback |
| `src/extension/acpUiCustomEditorProvider.ts` | Custom editor lifecycle |
| `src/extension/acpUiSessionsStore.ts` | UI session metadata keyed by header UUID |
| `webview/acp-ui/src/main.ts` | Consumes `historyReplay` before mount |

## Definition of done

1. Closing and reopening a chat restores the local transcript from JSONL when `session/load` is not used.
2. JSONL files grow during normal chat use without breaking existing sessions.
3. `historyReplay` populates the webview trace on open (`historyReplay` is sent before `init`).
