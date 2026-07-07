# Composer

## User facing

The chat composer is where you draft messages, run slash commands, mention workspace files, and (planned) attach multimodal content.

While typing, ACP UI suggests completions without leaving the message box.
Type `/` to open slash-command suggestions from the connected agent alongside built-in commands such as `/clear`, `/new`, `/rename`, and `/show-thinking`.
Type `@` to mention workspace files.
Paths with spaces or quotes are inserted as quoted mentions.

Drag files from the Explorer or your file manager onto the chat to insert `@` path mentions.

Arrow Up recalls previous prompts from local session history when the caret is at the start of the first line.
Arrow Down walks forward through recalled entries.
History is stored in the `.acp` session file (up to 55 entries) and restored on reopen.

Keyboard shortcuts while the composer is focused:

- Enter sends, Shift+Enter inserts a newline
- Shift+Tab cycles session mode when the agent exposes a mode option
- Ctrl+C / Cmd+C cancels an in-flight prompt when supported
- Ctrl+T / Cmd+T opens a new chat (when the Chats view or ACP UI editor is focused)

Planned: send images, audio, and structured file references in prompts when the agent advertises multimodal `promptCapabilities`.
Composer `@` file mentions will become structured ACP `resource` blocks instead of plain path text in the draft.
Today prompts are a single text block.

## Implementation

### Autocomplete

[buildComposerAutocompleteState](../../../webview/acp-ui/src/components/composerAutocomplete.ts) inspects the draft and caret.
It uses [queryFromCaret](../../../webview/acp-ui/src/components/composerAutocomplete.ts) to detect a `/query` or `@query` token.
Detection applies at the start of a line or after whitespace.

- **`/` mode** — filters [slashCommands](../../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Builds items via [slashSuggestionItem](../../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Groups with [groupSlashSuggestionItems](../../../webview/acp-ui/src/components/composerAutocomplete.ts).
- **`@` mode** — filters [workspaceFiles](../../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Formats inserts with [formatPathMention](../../../webview/acp-ui/src/components/composerAutocomplete.ts).

[ChatComposer](../../../webview/acp-ui/src/components/ChatComposer.tsx) recomputes autocomplete from the draft (caret at end).
[AcpUiApp.onComposerKeyDown](../../../webview/acp-ui/src/AcpUiApp.tsx) handles keyboard navigation.

**Built-in commands** — [builtInSlashCommands](../../../webview/acp-ui/src/AcpUiApp.tsx) defines `/clear`, `/new`, `/rename`, `/show-thinking`.
**Agent commands** — ACP `available_commands_update` is mapped in [sessionUpdateMapping.ts](../../../src/acp/mapping/sessionUpdateMapping.ts).
[slashCommandMetadata.ts](../../../src/acp/slashCommandMetadata.ts) normalizes source labels and grouping.

[workspaceFiles](../../../webview/acp-ui/src/AcpUiApp.tsx) from the extension init payload.
Filtering is case-insensitive substring match, capped at 30 results.

Protocol: [available_commands_update](../../acp/protocol/v2/slash-commands.mdx).

### Prompt history

[updateSessionHistory](../../../src/extension/acpUiSessionJsonl.ts) persists composer history to the session JSONL file.
[maxUserMessageHistoryEntries](../../../src/extension/acpUiSessionJsonlFormat.ts#L16) caps history at 55 entries.

[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L487-L523) handles Arrow Up and Arrow Down recall.
[shouldDeferJsonlHistoryReplay](../../../src/extension/acpUiSessionJsonlFormat.ts#L294) skips duplicate replay when agent load already restored user chunks.

Task: covered by [sessions](../acp/sessions.md).

### File drag and drop

[dataTransferLooksLikePathDrop](../../../webview/acp-ui/src/droppedFilePaths.ts#L8-L22) detects Explorer and OS file drops.
[collectPathsFromDataTransfer](../../../webview/acp-ui/src/droppedFilePaths.ts#L29-L60) resolves paths relative to the workspace root.
[appendFileMentionsToDraft](../../../webview/acp-ui/src/droppedFilePaths.ts#L180) inserts formatted `@` mentions.

[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx) handles dragover and drop on the shell.

### Keyboard bindings

[shouldCycleSessionModeOnShiftTab](../../../webview/acp-ui/src/components/composerKeybindings.ts#L16-L30) gates Shift+Tab mode cycling.
[shouldCancelRunOnCtrlC](../../../webview/acp-ui/src/components/composerKeybindings.ts#L32-L46) gates Ctrl+C cancel.
[shouldOpenNewChatOnCtrlT](../../../webview/acp-ui/src/components/composerKeybindings.ts#L1-L14) gates Ctrl+T new chat.

### Multimodal prompts

Not implemented.
[prompt](../../../src/acp/infrastructure/acpAgentProcess.ts) assembles text-only content today.
Composer `@` mentions are handled as text inserts until structured resource blocks ship.

Task: [multimodal-prompts](../../tasks/multimodal-prompts.md).
Protocol: [prompt turn](../../acp/protocol/v1/prompt-turn.mdx).
