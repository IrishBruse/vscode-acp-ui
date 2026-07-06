# Session Persistence

## User facing

Each chat is backed by a local transcript file.
Closing and reopening the chat restores your message history from disk when agent-side resume is unavailable or fails.

## Implementation

ACP UI uses client-owned JSONL session files (`acpUi/session/1` schema) as a supplement to ACP `session/load`.

[acpUiSessionJsonl.ts](../../src/extension/acpUiSessionJsonl.ts) handles append and read.
[acpUiSessionController.ts](../../src/extension/acpUiSessionController.ts) appends events during chat and sends `historyReplay` before `init` on open.
[main.ts](../../webview/acp-ui/src/main.ts) applies `historyReplay` before the webview mounts.

When `session/load` runs successfully, JSONL is cleared first and agent replay is authoritative.
On load failure, saved JSONL restores to disk and replays in the webview.

Task: [jsonl-persistence](../tasks/jsonl-persistence.md).
