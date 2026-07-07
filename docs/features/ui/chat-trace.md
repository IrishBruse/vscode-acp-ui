# Chat trace

## User facing

The chat trace is the scrolling conversation panel above the composer.
It shows your messages, streaming agent replies, reasoning thoughts, tool calls, file diffs, terminal output, and structured agent plans.

Agent text renders as theme-aware markdown with colored headings, GFM tables, and syntax-highlighted fenced code blocks.
Each code block has a copy button.

Tool calls appear inline while the agent works.
Choose how much detail you want with the **Tool call verbosity** setting (`minimal`, `compact`, or `verbose`):

- **Verbose** (default) shows full file previews and diffs per tool call.
- **Compact** shows one summary line per tool call.
- **Minimal** groups consecutive tool calls with a short summary and shows details for the last three only.

While a session loads from the agent, a loading indicator appears until replay finishes.

Adjust **Chat content width (%)** in settings to narrow the transcript and composer column (for example `50` centers a half-width column).

## Implementation

### Trace state and streaming

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L541-L787) applies extension messages to trace state.
[createChatStateFromInit](../../../webview/acp-ui/src/chatReducer.ts#L209-L337) seeds the trace from the bootstrap payload.

ACP `session/update` events map in [sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L621-L810):

- `agent_message_chunk` to streaming agent text
- `agent_thought_chunk` to thought blocks
- `user_message_chunk` to user text (including load replay)
- `tool_call` and `tool_call_update` to tool trace items
- `plan` to plan blocks

[joinThoughtChunks](../../../webview/acp-ui/src/chatReducer.ts#L339-L348) merges consecutive thought chunks.

### Trace rendering

[TraceList](../../../webview/acp-ui/src/components/TraceList.tsx#L148-L296) walks trace items and picks presentation by type and verbosity.
[usesCompactToolPresentation](../../../webview/acp-ui/src/components/TraceList.tsx#L37-L43) gates minimal and compact modes.

- Agent text: [AgentMarkdown](../../../webview/acp-ui/src/components/AgentMarkdown.tsx#L117-L167) with [remark-gfm](https://github.com/remarkjs/remark-gfm).
  Code highlighting uses [renderHighlightedCode](../../../webview/acp-ui/src/components/codeHighlighting.tsx#L101-L120) with workbench theme colors.
- Thoughts: [AgentThoughtBlock](../../../webview/acp-ui/src/components/AgentThoughtBlock.tsx).
- Plans: [PlanBlock](../../../webview/acp-ui/src/components/PlanBlock.tsx#L8-L40).
- Verbose tools: [ToolCallBlock](../../../webview/acp-ui/src/components/ToolCallBlock.tsx).
- Compact tools: [ToolCallCompactBlock](../../../webview/acp-ui/src/components/ToolCallCompactBlock.tsx).
  Execute output uses [ToolCallCompactExecuteBlock](../../../webview/acp-ui/src/components/ToolCallCompactExecuteBlock.tsx).
  Summaries come from [toolCallCompactText.ts](../../../webview/acp-ui/src/toolCallCompactText.ts).

[SessionHistoryLoader](../../../webview/acp-ui/src/components/SessionHistoryLoader.tsx) shows while `sessionHistoryLoading` is true during load replay.

### Tool call verbosity setting

[readToolCallVerbosityFromSettings](../../../src/acp/config/toolCallVerbositySetting.ts#L13-L19) reads `ib-acp-ui.toolCallVerbosity`.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L112-L115) posts updates on configuration change.

### Content width setting

[readContentWidthRatioFromSettings](../../../src/acp/config/contentWidthRatioSetting.ts#L17-L22) reads `ib-acp-ui.contentWidthPercent` as a 0.1 to 1 ratio.
[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L142-L143) applies it via the `--acp-ui-content-width-ratio` CSS variable.

### Markdown theme sync

[resolveMarkdownThemeVariables](../../../src/platform/vscode/resolveMarkdownThemeVariables.ts) resolves workbench colors and token rules for the webview.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L107-L109) reposts theme variables when the color theme changes.
[installAgentMarkdownThemeColors](../../../webview/acp-ui/src/agentMarkdownTheme.ts#L63-L86) applies CSS variables in the webview.
