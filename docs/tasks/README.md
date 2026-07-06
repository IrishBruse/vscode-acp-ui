# ACP UI tasks

Tracked work items for the extension.

Task file format: [AGENTS.md](./AGENTS.md).
Each task's YAML frontmatter links to a feature doc under `docs/features/`.

## Index

| Task | Feature | Status | File |
| --- | --- | --- | --- |
| Authentication | [authentication](../features/authentication.md) | Done | [auth.md](./auth.md) |
| Client capabilities (Zed parity) | [client-capabilities](../features/client-capabilities.md) | In progress | [client-capabilities.md](./client-capabilities.md) |
| Session resume (`session/load`) | [session-resume](../features/session-resume.md) | Done | [session-resume.md](./session-resume.md) |
| JSONL persistence + `historyReplay` | [session-persistence](../features/session-persistence.md) | Done | [jsonl-persistence.md](./jsonl-persistence.md) |
| Terminal capability | [terminal](../features/terminal.md) | Not started | [terminal.md](./terminal.md) |
| Terminal authentication | [terminal-authentication](../features/terminal-authentication.md) | Not started | [terminal-auth.md](./terminal-auth.md) |
| MCP servers forwarding | [mcp-servers](../features/mcp-servers.md) | Not started | [mcp-servers.md](./mcp-servers.md) |
| Session list / delete | [session-management](../features/session-management.md) | Not started | [session-list-delete.md](./session-list-delete.md) |
| `session/update` handlers | [session-updates](../features/session-updates.md) | Not started | [session-update-handlers.md](./session-update-handlers.md) |
| Cursor extension UX | [cursor-extensions](../features/cursor-extensions.md) | Not started | [cursor-extension-ux.md](./cursor-extension-ux.md) |
| Initialization metadata | [client-initialization](../features/client-initialization.md) | Not started | [initialization-metadata.md](./initialization-metadata.md) |
| Multimodal prompts + `@` mentions | [multimodal-prompts](../features/multimodal-prompts.md) | Not started | [multimodal-prompts.md](./multimodal-prompts.md) |
| Filesystem semantics | [filesystem-semantics](../features/filesystem-semantics.md) | Not started | [filesystem-semantics.md](./filesystem-semantics.md) |
| SDK unstables evaluation | [sdk-unstables](../features/sdk-unstables.md) | Not started | [sdk-unstables.md](./sdk-unstables.md) |
| Protocol v2 migration planning | [protocol-v2](../features/protocol-v2.md) | Not started | [protocol-v2.md](./protocol-v2.md) |
| ACP Registry in extension | [acp-registry](../features/acp-registry.md) | Not started | [acp-registry.md](./acp-registry.md) |

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
