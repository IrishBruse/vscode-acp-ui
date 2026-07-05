# Task: Terminal authentication (`auth.terminal` / `_meta.terminal-auth`)

**Status:** Not started  
**Priority:** P2  
**Owner:** unassigned  
**Source:** Zed `crates/agent_servers/src/acp.rs` (`client_capabilities_for_agent`, `meta_terminal_auth_task`)

## Deliverable

Advertise terminal auth support on `initialize` and run interactive agent login when the agent returns terminal-auth metadata on an auth method.

## Why

Zed sends for every agent:

```json
{
  "clientCapabilities": {
    "_meta": { "terminal-auth": true },
    "auth": { "terminal": true }
  }
}
```

Some agents (including legacy Gemini paths in Zed) embed login command details in the auth method `_meta.terminal-auth` object.
They use that instead of first-class `type: "terminal"` auth methods.
ACP UI only supports agent-type `authenticate` today ([auth.md](./auth.md)).

## Current behavior

| Area | Today |
| --- | --- |
| `_meta.terminal-auth` | Not advertised |
| `auth.terminal` | Not advertised |
| Login flow | `authenticate({ methodId })` for agent-type methods only |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `buildAcpClientCapabilities`, spawn login subprocess |
| `src/acp/session/acpSessionBridge.ts` | Post-init auth retry |
| Zed `meta_terminal_auth_task` | Reference for parsing auth method meta |

## Implementation checklist

- [ ] Add `_meta.terminal-auth: true` to `buildAcpClientCapabilities()` (all agents, per Zed)
- [ ] Add `auth: { terminal: true }` to `clientCapabilities`
- [ ] Parse `terminal-auth` meta on `AuthMethodAgent` when `command` / `args` present
- [ ] Spawn child process for interactive login (label, env, cwd)
- [ ] Retry `session/new` or surface error on auth failure
- [ ] Prefer first-class `AuthMethod::Terminal` when agent sends both (Zed precedence rule)
- [ ] Tests for meta parsing and capability builder
- [ ] `npm run verify` passes

## Definition of done

1. Agents that rely on terminal-auth meta can log in through ACP UI without manual CLI login.
2. Capability flags match implemented behavior.

## References

- [client-capabilities.md](./client-capabilities.md)
- [auth.md](./auth.md)
- [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication)
