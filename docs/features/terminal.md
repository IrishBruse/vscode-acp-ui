# Terminal

## User facing

Planned: agents that need a client-hosted terminal will be able to run commands through ACP UI in a VS Code terminal, with output streamed back to the agent.

Not shipped yet.
Tool display for terminal-style tool calls still appears in the chat trace from `session/update` payloads.

## Implementation

Not implemented.
The task covers advertising `terminal: true` and `_meta.terminal_output` on `initialize`.
It also covers implementing SDK `createTerminal` via `vscode.window.createTerminal`.

Task: [terminal](../tasks/terminal.md).
Protocol: [terminals](../acp/protocol/v1/terminals.mdx).
Related: [authentication](./authentication.md) for terminal auth, [client](./client.md) for capability advertisement.
