# Task: Initialization metadata

**Status:** Not started  
**Priority:** P3  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

1. Send `clientInfo` (`name`, `version`, optional `title`) on `initialize`.
2. Surface incompatible protocol versions to the user when negotiation fails.

Zed sends `clientInfo` with `name: "zed"` and the app version on every `initialize`.
See [client-capabilities.md](./client-capabilities.md).

## Why

`clientInfo` helps agents and support channels identify the client build.
Version mismatch today relies on SDK default behavior with no user-facing explanation.

## Current behavior

| Field | Today |
| --- | --- |
| `clientInfo` | Omitted on `initialize` |
| Version mismatch | No dedicated UI |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `initialize` params |
| `package.json` | Extension name and version for `clientInfo` |

## Implementation checklist

- [ ] Set `clientInfo.name` (e.g. `ib-acp-ui` / ACP UI)
- [ ] Set `clientInfo.version` from extension package version
- [ ] Optional `clientInfo.title` for display name
- [ ] Catch version negotiation failure and show actionable error (update extension / agent)
- [ ] `npm run verify` passes

## Definition of done

1. Every `initialize` includes accurate `clientInfo`.
2. Users see a clear message when protocol versions are incompatible.

## References

- `docs/acp/protocol/v1/initialization.mdx`
