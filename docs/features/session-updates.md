# Session Updates

## User facing

Planned: the chat UI will react to more agent-driven session updates: mode changes, config option updates, title sync, and usage meters.
User message chunks during `session/load` replay already appear in the trace.

## Implementation

[sessionUpdateMapping.ts](../../src/acp/mapping/sessionUpdateMapping.ts) maps `session/update` notifications to webview messages.
`user_message_chunk` maps to append user text (shipped).

Still no-op in the default branch: `current_mode_update`, `config_option_update`, `session_info_update`, and `usage_update`.

Task: [session-update-handlers](../tasks/session-update-handlers.md).
Protocol: [session modes](../acp/protocol/v1/session-modes.mdx), [session config options](../acp/protocol/v1/session-config-options.mdx), [prompt turn](../acp/protocol/v1/prompt-turn.mdx).
