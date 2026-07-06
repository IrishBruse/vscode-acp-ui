# MCP

## User facing

Planned: when your workspace has `.cursor/mcp.json`, ACP UI will forward those MCP server definitions to the agent on session setup.
Project MCP tools would then be available in chat.

Not shipped yet.
Session setup always passes an empty `mcpServers` array today.

## Implementation

Not implemented.
The task covers reading `.cursor/mcp.json` (and optional settings override).
It maps to the ACP `mcpServers` shape and passes the list on `session/new` and `session/load`.

Task: [mcp-servers](../tasks/mcp-servers.md).
Protocol: [session setup](../acp/protocol/v1/session-setup.mdx), [MCP over ACP](../acp/rfds/mcp-over-acp.mdx).
