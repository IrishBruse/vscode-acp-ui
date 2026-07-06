# Changelog

## Unreleased

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
