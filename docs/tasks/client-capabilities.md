# Task: Client capabilities parity (Zed)

**Status:** In progress  
**Priority:** P1  
**Owner:** unassigned  
**Source:** Zed `crates/agent_servers/src/acp.rs` (`client_capabilities_for_agent`), Cursor ACP forum threads

## Deliverable

Match Zed's `initialize` `clientCapabilities` where ACP UI can honor the advertised behavior.
Document gaps that need other tasks (terminal handlers, elicitation UI) before advertising.

## Zed vs ACP UI today

| Capability | Zed | ACP UI | Affects model picker? |
| --- | --- | --- | --- |
| `_meta.parameterizedModelPicker` | Cursor only | Cursor only (done) | Yes |
| `_meta.terminal_output` | all agents | not sent | No |
| `_meta.terminal-auth` | all agents | not sent | No |
| `terminal` | `true` | not sent | No |
| `auth.terminal` | `true` | not sent | No |
| `session.configOptions.boolean` | beta flag | not sent | Maybe |
| `elicitation` (form + url) | beta flag | not sent | No |
| `clientInfo` | name, version, title | omitted | No |
| `fs.readTextFile` / `writeTextFile` | `true` | `true` | No |

Reference implementation: [Zed `acp.rs`](https://github.com/zed-industries/zed/blob/main/crates/agent_servers/src/acp.rs) (`client_capabilities_for_agent`).

## Done

### `_meta.parameterizedModelPicker` (Cursor)

- [x] Detect Cursor spawn config (`isCursorAcpAgent`)
- [x] Send `_meta.parameterizedModelPicker: true` on `initialize`
- [x] Render agent-ordered `configOptions` in composer (`ConfigOptionControls`)
- [x] Variants-mode fallback: derive params from bracket-encoded model ids

Not in the ACP spec.
Cursor documents it only informally (forum / Zed issues).
See [Can't select thinking level or variant in Cursor ACP](https://forum.cursor.com/t/cant-select-thinking-level-or-variant-in-cursor-acp/161317).

Key files:

- `src/acp/domain/agentSpawnConfig.ts`
- `src/acp/infrastructure/acpAgentProcess.ts`
- `src/acp/session/sessionConfigOptions.ts`
- `webview/acp-ui/src/components/ConfigOptionControls.tsx`

## Not started

### `_meta.terminal_output`

Zed advertises `terminal_output: true` for every agent.
Signals the client can handle terminal output streaming from the agent.

- [ ] Add to `buildAcpClientCapabilities()` `_meta` for all agents
- [ ] Only after [terminal.md](./terminal.md) implements output callbacks (do not advertise without handlers)

### `_meta.terminal-auth` and `auth.terminal`

Zed advertises both for every agent.
Supports legacy auth where the agent embeds login command details in auth method `_meta.terminal-auth`.

- [ ] Add `_meta.terminal-auth: true` to `buildAcpClientCapabilities()`
- [ ] Add `auth: { terminal: true }` to `clientCapabilities`
- [ ] Spawn interactive login subprocess when agent returns terminal-auth meta on an auth method (see Zed `meta_terminal_auth_task`)
- [ ] Do not advertise until login flow is implemented

Related: [auth.md](./auth.md) (agent-type `authenticate` only today).

### `terminal: true`

Top-level terminal RPC support (`terminal/create`, `terminal/output`, kill, release).

Tracked in [terminal.md](./terminal.md).
Advertise together with `_meta.terminal_output`.

### `session.configOptions.boolean`

Zed sends this when the `AcpBetaFeatureFlag` is enabled:

```text
session.configOptions.boolean: {}
```

Tells the agent the client accepts `type: "boolean"` config options and boolean `session/set_config_option` values.

- [ ] Add `session: { configOptions: { boolean: {} } }` to `buildAcpClientCapabilities()` once SDK types allow it (loose object may work today)
- [ ] Confirm Cursor sends boolean fast/thinking toggles when advertised
- [ ] Tests in `agentSpawnConfig.test.ts` / `acpAgentProcess` capability builder

UI already renders boolean options as On/Off selects in `ConfigOptionControls`.

### `clientInfo`

Tracked in [initialization-metadata.md](./initialization-metadata.md).

### `elicitation` (form + url)

Zed advertises under the same beta flag as boolean config options.
Requires client UI to host agent-driven forms or URLs.

- [ ] Evaluate in [sdk-unstables.md](./sdk-unstables.md)
- [ ] File follow-up task if product wants elicitation dialogs

## Implementation notes

- Do not advertise `terminal: true` or `_meta.terminal_output` until [terminal.md](./terminal.md) is done.
Misleading capability ads break agents that rely on client-hosted terminals.
- `parameterizedModelPicker` is Cursor-specific.
Other agents should not receive it (match Zed: only when agent id is Cursor).
- Prefer standard ACP `configOptions` categories (`model_config`, `thought_level`) long term over more `_meta` keys.

## Definition of done

1. Capability advertisement matches implemented client callbacks.
2. Cursor model/param toolbar works via `parameterizedModelPicker` (done).
3. Remaining Zed gaps are either implemented or explicitly deferred with linked tasks.

## References

- [ACP Session Config Options](https://agentclientprotocol.com/protocol/v1/session-config-options)
- [ACP Extensibility (`_meta`)](https://agentclientprotocol.com/protocol/extensibility)
- [Zed issue #57571](https://github.com/zed-industries/zed/issues/57571) (parameterized model picker)
- `src/acp/infrastructure/acpAgentProcess.ts` (`buildAcpClientCapabilities`)
