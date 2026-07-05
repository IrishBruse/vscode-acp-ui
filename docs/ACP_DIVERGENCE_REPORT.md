# ACP Divergence Report

## Full coverage checklist

- [x] **Authentication** -- call `authenticate` / `logout` when `initialize` returns `authMethods`
- [ ] **Session resume** -- call `session/load` on chat open when agent advertises `loadSession` and a runtime `sessionId` exists
- [ ] **Session list** -- call `session/list` when agent advertises the capability
- [ ] **Session delete** -- call `session/delete` when user deletes a local chat and agent advertises the capability
- [ ] **Terminal capability** -- advertise `terminal: true` and implement `createTerminal` (VS Code terminal API)
- [ ] **MCP servers** -- forward `mcpServers` from `.cursor/mcp.json` or settings on `session/new` and `session/load`
- [ ] **`user_message_chunk`** -- map replay chunks during `session/load`
- [ ] **`current_mode_update`** -- handle mode changes and expose mode in composer
- [ ] **`config_option_update`** -- handle session config options (successor to modes)
- [ ] **`session_info_update`** -- sync agent-driven title and metadata
- [ ] **`usage_update`** -- show token / cost / context window usage
- [ ] **`clientInfo`** -- send `name`, `version`, and optional `title` on `initialize`
- [ ] **Version mismatch UI** -- surface incompatible protocol versions to the user
- [ ] **Multimodal prompts** -- send `image`, `audio`, `resource`, and embedded context when agent advertises `promptCapabilities`
- [ ] **Structured `@` mentions** -- send `resource` blocks for composer file mentions, not only path text
- [ ] **Unsaved buffer reads** -- `readTextFile` reflects open editor buffers, not only on-disk content
- [ ] **`line` / `limit` on read** -- support partial file reads per v1 schema
- [ ] **ENOENT semantics** -- decide whether to keep empty-string workaround or align with spec error responses
- [x] **JSONL persistence** -- wire `acpUiSessionJsonl` append and `historyReplay` into the session editor
- [ ] **`cursor/create_plan` phases** -- forward `phases` from bridge to webview
- [ ] **`cursor/update_todos` UI** -- dedicated todo panel instead of plan-style trace lines
- [ ] **`cursor/task` UI** -- richer subagent task display
- [ ] **`cursor/generate_image` UI** -- render generated images inline, not only path text
- [ ] **`toolCallId` on extension payloads** -- surface agent `toolCallId` in bridge request IDs
- [ ] **SDK unstables** -- evaluate `unstable_resumeSession`, `unstable_forkSession`, NES, document sync as needed
- [ ] **Protocol v2** -- track RFCs and plan migration when SDK and target agents move to v2

---

Comparison of the **ACP UI** implementation in this repository against:

- Cloned **ACP protocol docs and schema** in `docs/acp/` (synced from `agentclientprotocol/agent-client-protocol` @ `main`, 2026-07-04)
- Cloned **Cursor CLI ACP and extension docs** in `docs/cursor-extensions/` (synced from `https://cursor.com/docs/cli/acp`, 2026-07-04)
- Runtime dependency `@agentclientprotocol/sdk` **0.18.2** (`PROTOCOL_VERSION = 1`)

This report is a snapshot for maintainers.
It is not a conformance certificate.

---

## Summary

ACP UI is a **partial ACP v1 client** focused on chat UX in VS Code.
It uses the official TypeScript SDK for transport, initialization, prompting, permissions, and filesystem callbacks.
Coverage is strong for the **happy-path prompt loop** with Cursor CLI and similar agents.
It diverges materially from the full v1 surface (session resume, auth, terminals, MCP wiring, modes, multimodal prompts).
It also diverges from several Cursor extension UX expectations (rich todos, images, plan phases).

The cloned `docs/acp/protocol/v2/` tree describes a **future major version** (different method names and lifecycle).
This implementation intentionally targets **v1 via the SDK**, not v2.

---

## Architecture alignment

| Area | Upstream expectation | ACP UI implementation | Status |
|------|---------------------|----------------------|--------|
| Role | Editor is the ACP **Client**, agent is subprocess **Agent** | `AcpAgentProcess` spawns agent, `ClientSideConnection` drives RPC | Aligned |
| Transport | stdio, newline-delimited JSON-RPC 2.0 | `acp.ndJsonStream` over child stdin/stdout | Aligned |
| Core loop | `initialize` -> session setup -> `session/prompt` -> `session/update` | `start()` -> `newSession()` -> `prompt()` with update handler | Aligned |
| Client callbacks | `sessionUpdate`, `requestPermission`, optional `fs`, optional `terminal`, `extMethod` / `extNotification` | All except `createTerminal` implemented in `AcpAgentProcess` | Partial |
| UI boundary | N/A (product layer) | `AcpSessionBridge` maps ACP to `extensionHostMessages` for React webview | Extension-specific |

Primary code paths:

- `src/acp/infrastructure/acpAgentProcess.ts` -- SDK client, spawn, capabilities
- `src/acp/session/acpSessionBridge.ts` -- session bridge, permissions, Cursor extensions
- `src/acp/mapping/sessionUpdateMapping.ts` -- `session/update` -> webview messages
- `webview/acp-ui/` -- chat UI
- `standalone/server.ts` -- dev WebSocket host reusing the same bridge

---

## Protocol v1: implemented and aligned

### Initialization

- Sends `protocolVersion: PROTOCOL_VERSION` (1).
- Advertises `clientCapabilities.fs.readTextFile` and `writeTextFile: true`.
- Does **not** advertise `terminal: true` (consistent with not implementing terminal callbacks).

Docs reference: `docs/acp/protocol/v1/initialization.mdx`

### Session creation

- Calls `session/new` with workspace `cwd` and `mcpServers: []`.
- Applies optional `unstable_setSessionModel` when the agent returns models on `session/new`.

Docs reference: `docs/acp/protocol/v1/session-setup.mdx`

### Prompt turn

- Sends `session/prompt` with a single text block only.
- Handles `session/cancel` on user cancel and before a new send while in flight.
- Forwards permission outcomes using `{ outcome: { outcome: "selected", optionId } }` or `{ outcome: "cancelled" }`.
  This matches the v1 permission schema and the Cursor minimal client example.

Docs reference: `docs/acp/protocol/v1/prompt-turn.mdx`, `docs/acp/protocol/v1/tool-calls.mdx`

### `session/update` types handled

| `sessionUpdate` | Mapped to UI |
|-----------------|--------------|
| `agent_message_chunk` | `appendAgentText` (text blocks only) |
| `agent_thought_chunk` | `appendAgentThought` (with optional duration) |
| `tool_call` | `appendToolCall` |
| `tool_call_update` | `updateToolCall` (content, diff rows, subtitles) |
| `plan` | `appendPlan` |
| `available_commands_update` | `slashCommands` |

Docs reference: `docs/acp/schema/v1/schema.json` (`SessionUpdate` oneOf)

### Filesystem

- Implements SDK `readTextFile` / `writeTextFile` via `workspace.fs` (VS Code) or Node fs (standalone).

Docs reference: `docs/acp/protocol/v1/file-system.mdx`

---

## Protocol v1: divergences and gaps

### Critical functional gaps

| Topic | Upstream | ACP UI | Impact |
|-------|----------|--------|--------|
| **Authentication** | `initialize` may return `authMethods`, client should call `authenticate` (and optionally `logout`) | Never calls `authenticate` or `logout` | Works when agent is pre-authenticated (Cursor documents this). Fails for agents that require an explicit `authenticate` step after `initialize`. |
| **Session resume** | `session/load` replays history when `loadSession` capability is set, Cursor docs also recommend `session/load` | Always `session/new` on connect. Stores agent `sessionId` in workspace state / JSONL header but **never** calls `loadSession` | Reopening a chat starts a **new** agent session. Local transcript replay is not wired (see JSONL section). |
| **Agent session list / delete** | `session/list`, `session/delete` when advertised | Local VS Code "Chats" list only (`acpUiSessionsStore`). Delete removes local metadata, does not call `session/delete` | Agent-side session history is not managed through ACP. |
| **Terminal capability** | Client may advertise `terminal: true` and implement `terminal/create`, output, kill, release | Not advertised, `createTerminal` not implemented on `Client` | Agents that require client-hosted terminals cannot run commands through ACP UI. Tool **display** for terminal/execute kinds still works from `session/update` payloads. |
| **MCP servers** | `session/new` and `session/load` accept `mcpServers` from project config | Always passes `mcpServers: []` | Cursor ACP docs: MCP works when launching from a project with `.cursor/mcp.json`, but this client does not forward MCP definitions in the RPC. Relies entirely on agent-side discovery. |

Docs references:

- `docs/acp/protocol/v1/authentication.mdx`
- `docs/acp/protocol/v1/session-setup.mdx`
- `docs/acp/protocol/v1/session-list.mdx`
- `docs/acp/protocol/v1/session-delete.mdx`
- `docs/acp/protocol/v1/terminals.mdx`
- `docs/cursor-extensions/acp.md` (MCP section)

### `session/update` types not handled

These are defined in v1 schema but fall through to a no-op in `sessionUpdateToWebviewMessages` (default branch):

| `sessionUpdate` | Purpose |
|-----------------|---------|
| `user_message_chunk` | Stream user message echo during `session/load` replay |
| `current_mode_update` | Agent / plan / ask mode changes |
| `config_option_update` | Session config options (successor to modes) |
| `session_info_update` | Title and metadata sync |
| `usage_update` | Token / cost context window |

Impact: no mode picker, no usage meter, no agent-driven title sync, and incomplete load replay UX.

Docs references: `docs/acp/protocol/v1/session-modes.mdx`, `docs/acp/protocol/v1/session-config-options.mdx`,
`docs/acp/protocol/v1/session-list.mdx`, `docs/acp/protocol/v1/prompt-turn.mdx`

### Initialization metadata

| Field | Docs | ACP UI |
|-------|------|--------|
| `clientInfo` (`name`, `version`, optional `title`) | Recommended on `initialize` | Omitted |
| Capability negotiation follow-up | Client should close if versions incompatible | Relies on SDK default behavior, no user-facing version mismatch UI |

### Prompt content

| Capability | Docs | ACP UI |
|------------|------|--------|
| Multimodal `prompt` (`image`, `audio`, `resource`, embedded context) | Allowed when agent advertises `promptCapabilities` | Text only: `[{ type: "text", text }]` |
| Composer `@` file mentions | Product feature | Inserts paths into draft text, does not send structured `resource` blocks |

Docs reference: `docs/acp/protocol/v1/prompt-turn.mdx`, `docs/acp/protocol/v1/content` (via schema)

### Filesystem semantics

| Behavior | Docs | ACP UI |
|----------|------|--------|
| Read unsaved editor buffers | `fs/read_text_file` should reflect editor state | `workspace.fs.readFile` reads on-disk content only |
| `line` / `limit` on read | Optional partial read | Ignored, port interface is `readTextFile(path)` only |
| Missing file on read | Error response | Returns `{ content: "" }` for `ENOENT` (documented workaround for Gemini CLI create flows) |

Docs reference: `docs/acp/protocol/v1/file-system.mdx`
Code: `src/acp/infrastructure/acpAgentProcess.ts` (`handleReadTextFile`)

### Unstable / SDK-only APIs used

| API | Notes |
|-----|-------|
| `unstable_setSessionModel` | Model picker in UI, not described in cloned v1 protocol pages (SDK extension) |
| `extMethod` / `extNotification` | Used for Cursor `cursor/*` methods |

No use of other SDK unstables (`unstable_resumeSession`, `unstable_forkSession`, NES, document sync, etc.).

---

## Cursor extension methods

Source: `docs/cursor-extensions/extensions.md` (extract from Cursor ACP page)

### Coverage matrix

| Method | Upstream type | Bridge | Webview UX |
|--------|---------------|--------|------------|
| `cursor/ask_question` | Blocking RPC | Parsed, waits on webview response | Full dialog (`CursorAskQuestionDialog`) |
| `cursor/create_plan` | Blocking RPC | Parsed, empty `plan` -> cancelled | Dialog (`CursorCreatePlanDialog`), accept / reject / cancel |
| `cursor/update_todos` | Notification | Forwarded | Rendered as plan-style trace lines, not a dedicated todo panel |
| `cursor/task` | Notification | Forwarded | Single agent trace line (`Subagent task: ...`) |
| `cursor/generate_image` | Notification | Forwarded | Text line with path, **does not render the image** |

### Field-level divergences

| Topic | Cursor docs | ACP UI |
|-------|-------------|--------|
| `cursor/create_plan` `phases` | Optional grouped todos | Type allows `phases` in `extensionHostMessages`, but `AcpSessionBridge.handleExtensionMethod` does not forward `phases` to the webview |
| `toolCallId` on requests | Present on all extension payloads | Not surfaced in bridge request IDs (internal `cursor-ask-question-N` ids used instead) |
| `cursor/update_todos` response | Docs include a `Response` interface | Correctly treated as notification (no JSON-RPC reply) |
| Permission option names | Docs list `allow-once`, `allow-always`, `reject-once` as outcomes | UI passes through agent-provided `optionId` values via `selected` outcome (matches ACP v1 and Cursor minimal client, not the simplified bullet list) |

### Cursor documented flow vs implementation

Cursor recommended flow (`docs/cursor-extensions/acp.md`):

1. `initialize` -- done
2. `authenticate` with `cursor_login` -- **skipped** (relies on `agent login` / env pre-auth)
3. `session/new` or `session/load` -- **only `session/new`**
4. `session/prompt` -- done
5. `session/update` -- partial
6. `session/request_permission` -- done
7. `session/cancel` -- done

---

## Local session model vs ACP session model

ACP UI maintains **two parallel session concepts**:

| Layer | ID | Persistence | Purpose |
|-------|-----|-------------|---------|
| **UI session** | UUID in `acpUiSessionsStore` | VS Code `workspaceState` (`acpUi.chats.v2`) | Chats sidebar, editor tabs, prompt history memento |
| **ACP runtime session** | Agent `sessionId` from `session/new` | Stored on UI record as `sessionId` / `runtimeSessionId` | Intended for agent resume |

Additional **JSONL session files** (`src/extension/acpUiSessionJsonl.ts`, schema `acpUi/session/1`):

- Header + replay events and `historyReplay` message type.
- Integrated in `acpUiSessionController.ts`: appends on chat traffic, replays on open when agent load is skipped or fails.
- When `session/load` succeeds, the log is cleared and agent replay is authoritative.

This supplements ACP's `session/load` replay model with **client-owned transcript persistence**.

---

## Protocol v2 (cloned docs only)

`docs/acp/protocol/v2/` describes breaking changes, including:

- `auth/login` instead of `authenticate`
- `session/resume` emphasis over `session/load`
- JSON-RPC batch rules on transports
- Different prompt lifecycle (`state_update`, idle stop reasons)

ACP UI does **not** implement v2.
No action required until the SDK and target agents migrate.

---

## Intentional or pragmatic choices

These divergences appear deliberate for the current product scope:

1. **Text-first chat** -- simpler composer and mapping, sufficient for many CLI agents.
2. **Pre-auth agents** -- avoids embedding Cursor login UI in the extension.
3. **Empty file on ENOENT** -- agent compatibility (Gemini CLI read-before-write).
4. **Rich tool-call display layer** -- `sessionUpdateMapping.ts` adds subtitles, diff rows, and heuristics beyond the protocol minimum.
   This is especially useful for Cursor CLI sparse `tool_call_update` payloads.
5. **Standalone dev server** -- replays fixture NDJSON for UI work without a live agent.
6. **Extension host protocol** -- `extensionHostMessages.ts` is an internal UI contract, not part of ACP.

---

## Risk register (prioritized)

| Priority | Gap | Risk |
|----------|-----|------|
| P0 | No `session/load` / replay | Users lose agent conversation context when reopening chats |
| P0 | No `authenticate` | Agents requiring post-`initialize` auth fail silently or error |
| P1 | No terminal client | Some agents cannot execute tools that need `terminal/create` |
| P1 | JSONL persistence | Done: local transcript append + `historyReplay` fallback |
| P2 | Unhandled `session/update` variants | Missing modes, usage, titles, load replay chunks |
| P2 | MCP list always empty | May limit MCP unless agent loads config independently |
| P2 | Cursor extension UX thin | Todos, tasks, and images are not first-class UI |
| P3 | Multimodal prompts | Cannot send images/audio as first-class ACP content |
| P3 | `session/delete` on agent | Orphan agent sessions when user deletes local chat |
| P3 | v2 migration | Future SDK bump will require a dedicated migration pass |

---

## Suggested alignment work (ordered)

1. After `initialize`, if `authMethods` is non-empty, call `authenticate` (configurable `methodId`, default from agent or settings).
2. On chat open, if stored runtime `sessionId` exists and agent has `loadSession`, call `loadSession`.
   Map `user_message_chunk` and other replay updates into the trace.
3. Wire `acpUiSessionJsonl` append + `historyReplay` as offline fallback when `loadSession` is unavailable.
4. Forward `mcpServers` from `.cursor/mcp.json` (or settings) on `session/new` / `session/load`.
5. Implement `createTerminal` (VS Code terminal API) and advertise `terminal: true`.
6. Handle `current_mode_update` / `config_option_update` and expose mode in composer.
7. Forward `phases` on `cursor/create_plan` and add todo / image UI for Cursor notifications.
8. Send `clientInfo` on `initialize` for supportability.
9. Track v2 RFCs in `docs/acp/rfds/` when planning a protocol bump.

---

## Reference sync commands

Refresh cloned docs:

```bash
npm run sync:docs
# or: ./scripts/sync-docs.sh
```

Environment overrides: `ACP_DOCS_REF`, `SKIP_CURSOR=1`, `CURSOR_ACP_DOCS_URL`.

---

## Document metadata

- Generated: 2026-07-04
- Implementation version: `ib-acp-ui` 0.2.1
- SDK: `@agentclientprotocol/sdk` 0.18.2
- ACP docs source: `https://github.com/agentclientprotocol/agent-client-protocol/tree/main`
- Cursor docs source: `https://cursor.com/docs/cli/acp`
