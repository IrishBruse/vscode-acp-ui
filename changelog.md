# Changelog

## Unreleased

## 0.5.0 - 2026-07-07

- Added `minimal` tool call verbosity: groups tool calls with a summary line and shows only the last three detail lines (Cursor-style).
  `compact` now shows one line per tool call with no group summary.
  `verbose` is unchanged (full blocks with previews and diffs).
- Added a copy button on markdown code blocks (hover to reveal, with brief copied feedback).
- Store chats under `chats/<sessionId>/` with title-based `.acp` files so renames do not collide.
- Session `.acp` files are now a single JSON document with a `history` array (composer messages only).
  RPC traffic is logged to the `ACP UI RPC` output channel instead of session files.
- Send `clientInfo` on ACP initialize so agents receive package metadata.
  Protocol version mismatches surface actionable errors.
- Chats sidebar lists agent sessions when supported, falls back to local files, and stays visible while refreshing.
- Wire `session/delete` through the SDK with local tombstones when remote delete is unavailable.
- Added `npm run install:local` to build and install the extension into local VS Code.
- Markdown table headers use the VS Code theme foreground color.
- Fixed Chats delete so removed sessions stay gone after refresh.
- Fixed mid-prompt reconnect when sending a message after an agent-driven title update.
- Fixed ACP session lifecycle bugs in delete, connect, and UI config sync.

## 0.4.0 - 2026-07-06

- Added `ib-acp-ui.toolCallVerbosity` setting (`verbose` or `compact`) to switch tool calls between full blocks and single-line summaries.
- Added `ib-acp-ui.contentWidthPercent` setting (10 to 100) to control how much horizontal space the transcript and composer use.
  `100` is full width, `50` is half width with equal side margins.
- Group slash-command autocomplete by skill source with separate source labels for user and global skills.
- Restyled markdown tables to match VS Code settings lists (borderless, monospace, plain cell text).
- Compact mode keeps terminal commands separate from read/grep groups and truncates long command output with a tail preview plus hidden-line hint.
- Pin the conversation scrollbar to the far right of the chat panel while keeping transcript and composer content centered.
- Show the loading indicator immediately when a prompt is sent.

## 0.3.0 - 2026-07-06

- Added disk-backed `.acp` session files with JSONL event persistence, autosave, and a custom editor.
  - Log ACP RPC traffic into session files and pretty-print persisted session JSON.
- Resume chats on reopen via ACP `session/load`, with JSONL transcript replay as a fallback.
- Drive the Chats sidebar from ACP `session/list` for the active agent, with loading state during resume.
- Added composer session config, model picker in the footer, model variant selection, and cached options on reconnect.
- Added session mode indicator with `Shift+Tab` mode cycling.
- Added agent `authenticate` / `logout` flows when auth methods are advertised.
- Added new-chat shortcut, improved composer autocomplete, and markdown colors derived from the editor theme.

## 0.2.1 - 2026-04-14

- Maintenance patch release with no user-facing feature changes.

## 0.2.0 - 2026-04-14

- Added built-in composer commands `/rename` and `/show-thinking`.
- Added keyboard/session rename support in Chats (`F2` + command + context menu).
- Added built-in command documentation in `BUILTIN_COMMANDS.md` and linked it from `README.md`.
- Renamed the VS Code output channel to `ACP UI RPC`.
- Removed file-based RPC logging from extension activation to avoid log file creation failures.
