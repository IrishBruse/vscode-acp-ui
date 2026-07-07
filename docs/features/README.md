# Feature index

Shipped and in-progress product features for ACP UI.
Each file combines a user-facing story with implementation notes.
See [AGENTS.md](./AGENTS.md) for authoring rules.

## ACP client surfaces

| Feature | Doc |
| --- | --- |
| Initialize handshake, client capabilities | [client](./acp/client.md) |
| Agent authentication | [authentication](./acp/authentication.md) |
| Tool permission prompts | [permissions](./acp/permissions.md) |
| Session lifecycle, persistence, list/delete | [sessions](./acp/sessions.md) |
| Filesystem read/write for agents | [filesystem](./acp/filesystem.md) |
| Client-hosted terminals | [terminal](./acp/terminal.md) (planned) |
| MCP server forwarding | [mcp](./acp/mcp.md) (planned) |
| Agent registry install flow | [agent-registry](./acp/agent-registry.md) (planned) |

## Chat UI surfaces

| Feature | Doc |
| --- | --- |
| Custom editor, sidebar, commands | [editor-shell](./ui/editor-shell.md) |
| Agent configuration and picker | [agents](./ui/agents.md) |
| Chat transcript and tool display | [chat-trace](./ui/chat-trace.md) |
| Composer input, autocomplete, history | [composer](./ui/composer.md) |
| Model and session config toolbar | [session-config](./ui/session-config.md) |
| Cursor extension method dialogs | [cursor-extensions](./ui/cursor-extensions.md) |

## Maintainer surfaces

| Feature | Doc |
| --- | --- |
| Protocol v2 and SDK unstables | [platform](./maintainer/platform.md) |
| Standalone webview dev server | [standalone](./maintainer/standalone.md) |
| ACP RPC NDJSON logging | [rpc-logging](./maintainer/rpc-logging.md) |
