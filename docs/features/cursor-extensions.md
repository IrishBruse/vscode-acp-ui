# Cursor Extensions

## User facing

Planned: richer UI for Cursor-specific extension methods beyond what the trace shows today.
Goals include phased plan dialogs, a dedicated todo panel, structured subagent task cards, and inline generated images.

`cursor/ask_question` and basic `cursor/create_plan` dialogs already work.

## Implementation

[AcpSessionBridge.handleExtensionMethod](../../src/acp/session/acpSessionBridge.ts) routes `cursor/*` ext methods.
[CursorAskQuestionDialog](../../webview/acp-ui/src/components/) handles ask-question flows.

Gaps: `phases` on create_plan, dedicated UI for `update_todos` and `task`, inline `generate_image`, and agent `toolCallId` correlation in bridge request ids.

Task: [cursor-extension-ux](../tasks/cursor-extension-ux.md).
Reference: [cursor extensions](../cursor-extensions/extensions.md).
