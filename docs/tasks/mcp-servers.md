# Task: MCP servers forwarding

**Status:** Not started  
**Priority:** P1  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

Forward `mcpServers` from `.cursor/mcp.json` and/or extension settings on `session/new` and `session/load` instead of always passing `mcpServers: []`.

## Why

Cursor ACP docs describe MCP working when launching from a project with `.cursor/mcp.json`.
This client does not forward MCP definitions in RPC and relies entirely on agent-side discovery.

## Current behavior

| Area | Today |
| --- | --- |
| `session/new` | Always `mcpServers: []` |
| `session/load` | Not called (see [session-resume.md](./session-resume.md)) |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `newSession` / `loadSession` params |
| New or existing config reader | Parse `.cursor/mcp.json` and settings |

## Implementation checklist

- [ ] Read MCP server definitions from workspace `.cursor/mcp.json`
- [ ] Optional override or merge from `ib-acp-ui` settings key (if added)
- [ ] Map to ACP `mcpServers` shape expected by SDK
- [ ] Pass on `session/new` and `session/load`
- [ ] Handle missing file (empty array, no error)
- [ ] Tests with fixture `mcp.json`
- [ ] `npm run verify` passes

## Definition of done

1. Session setup RPC includes MCP servers from the workspace when configured.
2. Behavior matches Cursor ACP docs expectation for project MCP config.

## References

- `docs/acp/protocol/v1/session-setup.mdx`
- `docs/cursor-extensions/acp.md` (MCP section)
- `docs/acp/rfds/mcp-over-acp.mdx`
