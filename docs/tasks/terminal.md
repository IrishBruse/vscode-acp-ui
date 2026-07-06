---
status: not-started
feature: docs/features/acp/terminal.md
---

# Task: Terminal capability (`terminal/create`)

## Deliverable

Advertise `terminal: true` and `_meta.terminal_output: true` on `initialize`.
Implement SDK `createTerminal` using the VS Code terminal API (output, kill, release as required by v1).

See also [client-capabilities.md](./client-capabilities.md) for Zed parity (`terminal_output` meta).

## Why

Agents that require client-hosted terminals cannot run tools through ACP UI today.
Tool **display** for terminal/execute kinds still works from `session/update` payloads, but execution needs a real terminal callback.

## Current behavior

| Area | Today |
| --- | --- |
| `initialize` | Does not advertise `terminal: true` or `_meta.terminal_output` |
| `AcpAgentProcess` | `createTerminal` not implemented on `Client` |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | Client capabilities and callbacks |
| VS Code `vscode.window.createTerminal` | Terminal creation |

## Implementation checklist

- [ ] Advertise `clientCapabilities.terminal: true` on `initialize`
- [ ] Advertise `_meta.terminal_output: true` on `initialize` (with terminal handlers)
- [ ] Implement `createTerminal` (cwd, env, shell as per schema)
- [ ] Wire terminal output streaming back to agent per v1 terminals spec
- [ ] Implement kill / release lifecycle
- [ ] Standalone server stub or documented limitation for dev host
- [ ] Tests where feasible (mock terminal API)
- [ ] `npm run verify` passes

## Definition of done

1. Agents that call `terminal/create` can run commands through ACP UI in VS Code.
2. Capability advertisement matches implemented callbacks.

## References

- `docs/acp/protocol/v1/terminals.mdx`
