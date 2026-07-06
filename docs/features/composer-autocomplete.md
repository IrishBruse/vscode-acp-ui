# Composer Autocomplete

## User facing

While typing in the chat composer, ACP UI can suggest completions without leaving the message box.

Type `/` to open slash-command suggestions.
Commands from the connected agent appear alongside built-in commands such as `/clear`, `/new`, `/rename`, and `/show-thinking`.
Filter by continuing to type after the slash.
Pick a suggestion with the keyboard or mouse to insert the command and a trailing space.

Agent-provided commands may show a description and a source label (for example workspace skills vs user skills).
Suggestions are grouped by source so related commands stay together.

Type `@` to mention workspace files.
Suggestions match paths that contain the text after `@`.
Paths with spaces or quotes are inserted as quoted mentions.

## Implementation

### Trigger and state

[buildComposerAutocompleteState](../../webview/acp-ui/src/components/composerAutocomplete.ts) inspects the draft and caret.
It uses [queryFromCaret](../../webview/acp-ui/src/components/composerAutocomplete.ts) to detect a `/query` or `@query` token.
Detection applies at the start of a line or after whitespace.

- **`/` mode** — filters [slashCommands](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Builds items via [slashSuggestionItem](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Groups with [groupSlashSuggestionItems](../../webview/acp-ui/src/components/composerAutocomplete.ts).
- **`@` mode** — filters [workspaceFiles](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Formats inserts with [formatPathMention](../../webview/acp-ui/src/components/composerAutocomplete.ts).

Returns `null` when there are no matches.

[ChatComposer](../../webview/acp-ui/src/components/ChatComposer.tsx) recomputes autocomplete from the draft (caret at end).
[AcpUiApp.onComposerKeyDown](../../webview/acp-ui/src/AcpUiApp.tsx) handles keyboard navigation.
Escape dismisses.
Arrows move the active index ([wrapIndex](../../webview/acp-ui/src/components/composerAutocomplete.ts)).
Enter inserts the selected [insertText](../../webview/acp-ui/src/AcpUiApp.tsx).
[onDraftChange](../../webview/acp-ui/src/AcpUiApp.tsx) resets the suggestion index and re-opens autocomplete after edits.

### Slash commands

**Built-in commands** — [builtInSlashCommands](../../webview/acp-ui/src/AcpUiApp.tsx) defines `/clear`, `/new`, `/rename`, `/show-thinking`.
[submit](../../webview/acp-ui/src/AcpUiApp.tsx) handles them locally before prompts go to the agent.

**Agent commands** — ACP `available_commands_update` is mapped in [sessionUpdateMapping.ts](../../src/acp/mapping/sessionUpdateMapping.ts).
That produces a [slashCommands](../../src/protocol/extensionHostMessages.ts message.
[AcpUiSlashCommand](../../src/protocol/extensionHostMessages.ts) is the payload shape.
[chatReducer](../../webview/acp-ui/src/chatReducer.ts) stores commands on session state.
Initial state is [slashCommands: []](../../webview/acp-ui/src/chatReducer.ts
[mergedSlashCommands](../../webview/acp-ui/src/AcpUiApp.tsx) merges built-ins with agent commands and dedupes by lowercase name (built-ins win).

### Metadata normalization

[slashCommandMetadata.ts](../../src/acp/slashCommandMetadata.ts) is shared between the extension host and webview.

- [parseTrailingParenLabels](../../src/acp/slashCommandMetadata.ts) — strip trailing `(label)` segments from Cursor descriptions.
- [normalizeSlashCommandSource](../../src/acp/slashCommandMetadata.ts) — merge explicit source with parsed labels (` · ` separated).
- [slashCommandGroupLabel](../../src/acp/slashCommandMetadata.ts) — pick group heading (workspace, user skill, user, global).
- [compareSlashCommandGroups](../../src/acp/slashCommandMetadata.ts) — sort groups.
  Order: built-in, workspace, user skill, user, global, then alpha.
- [normalizeSlashCommand](../../src/acp/slashCommandMetadata.ts) — apply parsing before display and storage.

The mapper reads [source, scope, skillSource](../../src/acp/mapping/sessionUpdateMapping.ts) from each command object.
It then calls [normalizeSlashCommand](../../src/acp/mapping/sessionUpdateMapping.ts).

### File mentions

[workspaceFiles](../../webview/acp-ui/src/AcpUiApp.tsx from the extension init payload.
Filtering is case-insensitive substring match, capped at 30 results.
See [composerAutocomplete.ts](../../webview/acp-ui/src/components/composerAutocomplete.ts).

### Tests

- [slashCommandMetadata.test.ts](../../src/acp/slashCommandMetadata.test.ts) — label parsing, source merge, grouping, sort order.
- [composerAutocomplete.test.ts](../../webview/acp-ui/src/components/composerAutocomplete.test.ts) — slash prefix filter and `@` file suggestions.
- [wrapIndex tests](../../webview/acp-ui/src/components/composerAutocomplete.test.ts).

### Protocol reference

ACP slash commands: [available_commands_update](../acp/protocol/v2/slash-commands.mdx).
