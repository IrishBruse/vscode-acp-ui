# Composer

## User facing

The chat composer is where you draft messages, run slash commands, mention workspace files, and (planned) attach multimodal content.

While typing, ACP UI suggests completions without leaving the message box.
Type `/` to open slash-command suggestions from the connected agent alongside built-in commands such as `/clear`, `/new`, `/rename`, and `/show-thinking`.
Type `@` to mention workspace files.
Paths with spaces or quotes are inserted as quoted mentions.

Planned: send images, audio, and structured file references in prompts when the agent advertises multimodal `promptCapabilities`.
Composer `@` file mentions will become structured ACP `resource` blocks instead of plain path text in the draft.
Today prompts are a single text block.

## Implementation

### Autocomplete

[buildComposerAutocompleteState](../../webview/acp-ui/src/components/composerAutocomplete.ts) inspects the draft and caret.
It uses [queryFromCaret](../../webview/acp-ui/src/components/composerAutocomplete.ts) to detect a `/query` or `@query` token.
Detection applies at the start of a line or after whitespace.

- **`/` mode** — filters [slashCommands](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Builds items via [slashSuggestionItem](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Groups with [groupSlashSuggestionItems](../../webview/acp-ui/src/components/composerAutocomplete.ts).
- **`@` mode** — filters [workspaceFiles](../../webview/acp-ui/src/components/composerAutocomplete.ts).
  Formats inserts with [formatPathMention](../../webview/acp-ui/src/components/composerAutocomplete.ts).

[ChatComposer](../../webview/acp-ui/src/components/ChatComposer.tsx) recomputes autocomplete from the draft (caret at end).
[AcpUiApp.onComposerKeyDown](../../webview/acp-ui/src/AcpUiApp.tsx) handles keyboard navigation.

**Built-in commands** — [builtInSlashCommands](../../webview/acp-ui/src/AcpUiApp.tsx) defines `/clear`, `/new`, `/rename`, `/show-thinking`.
**Agent commands** — ACP `available_commands_update` is mapped in [sessionUpdateMapping.ts](../../src/acp/mapping/sessionUpdateMapping.ts).
[slashCommandMetadata.ts](../../src/acp/slashCommandMetadata.ts) normalizes source labels and grouping.

[workspaceFiles](../../webview/acp-ui/src/AcpUiApp.tsx) from the extension init payload.
Filtering is case-insensitive substring match, capped at 30 results.

Protocol: [available_commands_update](../acp/protocol/v2/slash-commands.mdx).

### Multimodal prompts

Not implemented.
[prompt](../../src/acp/infrastructure/acpAgentProcess.ts) assembles text-only content today.
Composer `@` mentions are handled as text inserts until structured resource blocks ship.

Task: [multimodal-prompts](../tasks/multimodal-prompts.md).
Protocol: [prompt turn](../acp/protocol/v1/prompt-turn.mdx).
