# ACP UI tasks

Tracked work items for the extension.
Source: `docs/ACP_DIVERGENCE_REPORT.md` (2026-07-04).

## Index

| Task | Priority | Status | File |
| --- | --- | --- | --- |
| Authentication | P0 | Done | [auth.md](./auth.md) |
| Session resume (`session/load`) | P0 | Not started | [session-resume.md](./session-resume.md) |
| JSONL persistence + `historyReplay` | P0 | Not started | [jsonl-persistence.md](./jsonl-persistence.md) |
| Terminal capability | P1 | Not started | [terminal.md](./terminal.md) |
| MCP servers forwarding | P1 | Not started | [mcp-servers.md](./mcp-servers.md) |
| Session list / delete | P2/P3 | Not started | [session-list-delete.md](./session-list-delete.md) |
| `session/update` handlers (modes, usage, title) | P2 | Not started | [session-update-handlers.md](./session-update-handlers.md) |
| Cursor extension UX | P2 | Not started | [cursor-extension-ux.md](./cursor-extension-ux.md) |
| Initialization metadata | P3 | Not started | [initialization-metadata.md](./initialization-metadata.md) |
| Multimodal prompts + `@` mentions | P3 | Not started | [multimodal-prompts.md](./multimodal-prompts.md) |
| Filesystem semantics | P3 | Not started | [filesystem-semantics.md](./filesystem-semantics.md) |
| SDK unstables evaluation | P3 | Not started | [sdk-unstables.md](./sdk-unstables.md) |
| Protocol v2 migration planning | P3 | Not started | [protocol-v2.md](./protocol-v2.md) |
| ACP Registry in extension | -- | Not started | [acp-registry.md](./acp-registry.md) |

## Suggested implementation order

1. Authentication (done)
2. [session-resume.md](./session-resume.md) + replay mapping (`user_message_chunk`)
3. [jsonl-persistence.md](./jsonl-persistence.md) as fallback when `loadSession` is unavailable
4. [mcp-servers.md](./mcp-servers.md)
5. [terminal.md](./terminal.md)
6. [session-update-handlers.md](./session-update-handlers.md)
7. [cursor-extension-ux.md](./cursor-extension-ux.md)
8. [initialization-metadata.md](./initialization-metadata.md) (`clientInfo`)
9. [protocol-v2.md](./protocol-v2.md) (track only until SDK bump)
