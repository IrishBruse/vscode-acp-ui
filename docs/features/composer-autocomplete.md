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

[buildComposerAutocompleteState](../../webview/acp-ui/src/components/composerAutocomplete.ts#L85-L124) inspects the draft and caret.
It uses [queryFromCaret](../../webview/acp-ui/src/components/composerAutocomplete.ts#L33-L43) to detect a `/query` or `@query` token.
Detection applies at the start of a line or after whitespace.

- **`/` mode** — filters [slashCommands](../../webview/acp-ui/src/components/composerAutocomplete.ts#L94-L100).
  Builds items via [slashSuggestionItem](../../webview/acp-ui/src/components/composerAutocomplete.ts#L45-L58).
  Groups with [groupSlashSuggestionItems](../../webview/acp-ui/src/components/composerAutocomplete.ts#L60-L83).
- **`@` mode** — filters [workspaceFiles](../../webview/acp-ui/src/components/composerAutocomplete.ts#L107-L114).
  Formats inserts with [formatPathMention](../../webview/acp-ui/src/components/composerAutocomplete.ts#L29-L31).

Returns `null` when there are no matches.

[ChatComposer](../../webview/acp-ui/src/components/ChatComposer.tsx#L97-L105) recomputes autocomplete from the draft (caret at end).
[AcpUiApp.onComposerKeyDown](../../webview/acp-ui/src/AcpUiApp.tsx#L372-L475) handles keyboard navigation.
Escape dismisses.
Arrows move the active index ([wrapIndex](../../webview/acp-ui/src/components/composerAutocomplete.ts#L126-L132)).
Enter inserts the selected [insertText](../../webview/acp-ui/src/AcpUiApp.tsx#L458-L472).
[onDraftChange](../../webview/acp-ui/src/AcpUiApp.tsx#L306-L311) resets the suggestion index and re-opens autocomplete after edits.

### Slash commands

**Built-in commands** — [builtInSlashCommands](../../webview/acp-ui/src/AcpUiApp.tsx#L271-L290) defines `/clear`, `/new`, `/rename`, `/show-thinking`.
[submit](../../webview/acp-ui/src/AcpUiApp.tsx#L313-L370) handles them locally before prompts go to the agent.

**Agent commands** — ACP `available_commands_update` is mapped in [sessionUpdateMapping.ts](../../src/acp/mapping/sessionUpdateMapping.ts#L726-L781).
That produces a [slashCommands](../../src/protocol/extensionHostMessages.ts#L246) webview message.
[AcpUiSlashCommand](../../src/protocol/extensionHostMessages.ts#L37-L44) is the payload shape.
[chatReducer](../../webview/acp-ui/src/chatReducer.ts#L704-L705) stores commands on session state.
Initial state is [slashCommands: []](../../webview/acp-ui/src/chatReducer.ts#L196).

[mergedSlashCommands](../../webview/acp-ui/src/AcpUiApp.tsx#L292-L304) merges built-ins with agent commands and dedupes by lowercase name (built-ins win).

### Metadata normalization

[slashCommandMetadata.ts](../../src/acp/slashCommandMetadata.ts) is shared between the extension host and webview.

- [parseTrailingParenLabels](../../src/acp/slashCommandMetadata.ts#L2-L17) — strip trailing `(label)` segments from Cursor descriptions.
- [normalizeSlashCommandSource](../../src/acp/slashCommandMetadata.ts#L20-L45) — merge explicit source with parsed labels (` · ` separated).
- [slashCommandGroupLabel](../../src/acp/slashCommandMetadata.ts#L70-L86) — pick group heading (workspace, user skill, user, global).
- [compareSlashCommandGroups](../../src/acp/slashCommandMetadata.ts#L88-L102) — sort groups.
  Order: built-in, workspace, user skill, user, global, then alpha.
- [normalizeSlashCommand](../../src/acp/slashCommandMetadata.ts#L104-L123) — apply parsing before display and storage.

The mapper reads [source, scope, skillSource](../../src/acp/mapping/sessionUpdateMapping.ts#L758-L772) from each command object.
It then calls [normalizeSlashCommand](../../src/acp/mapping/sessionUpdateMapping.ts#L773-L778).

### File mentions

[workspaceFiles](../../webview/acp-ui/src/AcpUiApp.tsx#L384) comes from the extension init payload.
Filtering is case-insensitive substring match, capped at 30 results.
See [composerAutocomplete.ts](../../webview/acp-ui/src/components/composerAutocomplete.ts#L107-L109).

### Tests

- [slashCommandMetadata.test.ts](../../src/acp/slashCommandMetadata.test.ts#L10-L76) — label parsing, source merge, grouping, sort order.
- [composerAutocomplete.test.ts](../../webview/acp-ui/src/components/composerAutocomplete.test.ts#L7-L71) — slash prefix filter and `@` file suggestions.
- [wrapIndex tests](../../webview/acp-ui/src/components/composerAutocomplete.test.ts#L66-L70).

### Protocol reference

ACP slash commands: [available_commands_update](../acp/protocol/v2/slash-commands.mdx).
