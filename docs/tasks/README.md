# ACP UI tasks

Tracked work items for the extension.

Task file format: [AGENTS.md](./AGENTS.md).
Each task's YAML frontmatter links to a high-level feature doc under `docs/features/`.

## Index

| Task | Feature | Status | File |
| --- | --- | --- | --- |
| Client capabilities (Zed parity) | [client](../features/acp/client.md) | In progress | [client-capabilities.md](./client-capabilities.md) |
| Terminal capability | [terminal](../features/acp/terminal.md) | Not started | [terminal.md](./terminal.md) |
| Terminal authentication | [authentication](../features/acp/authentication.md) | Not started | [terminal-auth.md](./terminal-auth.md) |
| MCP servers forwarding | [mcp](../features/acp/mcp.md) | Not started | [mcp-servers.md](./mcp-servers.md) |
| `session/update` handlers | [sessions](../features/acp/sessions.md) | Not started | [session-update-handlers.md](./session-update-handlers.md) |
| Cursor extension UX | [cursor-extensions](../features/ui/cursor-extensions.md) | Not started | [cursor-extension-ux.md](./cursor-extension-ux.md) |
| Initialization metadata | [client](../features/acp/client.md) | Not started | [initialization-metadata.md](./initialization-metadata.md) |
| Multimodal prompts + `@` mentions | [composer](../features/ui/composer.md) | Not started | [multimodal-prompts.md](./multimodal-prompts.md) |
| Filesystem semantics | [filesystem](../features/acp/filesystem.md) | Not started | [filesystem-semantics.md](./filesystem-semantics.md) |
| SDK unstables evaluation | [platform](../features/maintainer/platform.md) | Not started | [sdk-unstables.md](./sdk-unstables.md) |
| Protocol v2 migration planning | [platform](../features/maintainer/platform.md) | Not started | [protocol-v2.md](./protocol-v2.md) |
| ACP Registry in extension | [agent-registry](../features/acp/agent-registry.md) | Not started | [acp-registry.md](./acp-registry.md) |

## Suggested implementation order

1. [mcp-servers.md](./mcp-servers.md)
2. [client-capabilities.md](./client-capabilities.md) (boolean config, remaining `_meta` after terminal)
3. [terminal.md](./terminal.md)
4. [terminal-auth.md](./terminal-auth.md)
5. [session-update-handlers.md](./session-update-handlers.md)
6. [cursor-extension-ux.md](./cursor-extension-ux.md)
7. [initialization-metadata.md](./initialization-metadata.md) (`clientInfo`)
8. [protocol-v2.md](./protocol-v2.md) (track only until SDK bump)
