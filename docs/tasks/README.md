# ACP UI tasks

Tracked work items for the extension.

Task file format: [AGENTS.md](./AGENTS.md).
Each task's YAML frontmatter links to a high-level feature doc under `docs/features/`.

## Index

| Task | Feature | Status | File |
| --- | --- | --- | --- |
| Authentication | [authentication](../features/acp/authentication.md) | Done | [auth.md](./auth.md) |
| Client capabilities (Zed parity) | [client](../features/acp/client.md) | In progress | [client-capabilities.md](./client-capabilities.md) |
| Session resume (`session/load`) | [sessions](../features/acp/sessions.md) | Done | [session-resume.md](./session-resume.md) |
| JSONL persistence + `historyReplay` | [sessions](../features/acp/sessions.md) | Done | [jsonl-persistence.md](./jsonl-persistence.md) |
| Terminal capability | [terminal](../features/acp/terminal.md) | Not started | [terminal.md](./terminal.md) |
| Terminal authentication | [authentication](../features/acp/authentication.md) | Not started | [terminal-auth.md](./terminal-auth.md) |
| MCP servers forwarding | [mcp](../features/acp/mcp.md) | Not started | [mcp-servers.md](./mcp-servers.md) |
| Session list / delete | [sessions](../features/acp/sessions.md) | Done | [session-list-delete.md](./session-list-delete.md) |
| `session/update` handlers | [sessions](../features/acp/sessions.md) | Not started | [session-update-handlers.md](./session-update-handlers.md) |
| Cursor extension UX | [cursor-extensions](../features/ui/cursor-extensions.md) | Not started | [cursor-extension-ux.md](./cursor-extension-ux.md) |
| Initialization metadata | [client](../features/acp/client.md) | Not started | [initialization-metadata.md](./initialization-metadata.md) |
| Multimodal prompts + `@` mentions | [composer](../features/ui/composer.md) | Not started | [multimodal-prompts.md](./multimodal-prompts.md) |
| Filesystem semantics | [filesystem](../features/acp/filesystem.md) | Not started | [filesystem-semantics.md](./filesystem-semantics.md) |
| SDK unstables evaluation | [platform](../features/maintainer/platform.md) | Not started | [sdk-unstables.md](./sdk-unstables.md) |
| Protocol v2 migration planning | [platform](../features/maintainer/platform.md) | Not started | [protocol-v2.md](./protocol-v2.md) |
| ACP Registry in extension | [agent-registry](../features/acp/agent-registry.md) | Not started | [acp-registry.md](./acp-registry.md) |

## Suggested implementation order

1. Authentication (done)
2. [session-resume.md](./session-resume.md) + replay mapping (`user_message_chunk`)
3. [jsonl-persistence.md](./jsonl-persistence.md) as fallback when `loadSession` is unavailable
4. [mcp-servers.md](./mcp-servers.md)
5. [client-capabilities.md](./client-capabilities.md) (boolean config, remaining `_meta` after terminal)
6. [terminal.md](./terminal.md)
7. [terminal-auth.md](./terminal-auth.md)
8. [session-update-handlers.md](./session-update-handlers.md)
9. [cursor-extension-ux.md](./cursor-extension-ux.md)
10. [initialization-metadata.md](./initialization-metadata.md) (`clientInfo`)
11. [protocol-v2.md](./protocol-v2.md) (track only until SDK bump)
