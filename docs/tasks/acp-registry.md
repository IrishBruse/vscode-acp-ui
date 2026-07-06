---
status: not-started
feature: docs/features/acp-registry.md
---

# Task: Implement ACP Registry in the extension

## Deliverable

Ship registry support inside this VS Code extension so a user can discover agents from the official catalog and install them without editing `settings.json`.
Installed agents run through the same spawn path as manual `ib-acp-ui.agents` entries.

This is an **extension feature task**, not a standalone library or docs-only effort.
When the task is done, registry agents are visible and launchable from normal ACP UI flows (new chat, agent picker, session reconnect).

Minimum viable integration ("in some way"):

1. Extension fetches and caches `registry.json` from the ACP CDN.
2. User runs a new command to browse the catalog and install an agent.
3. Installed registry agents appear in the existing agent picker and spawn like manual entries.
4. Manual `ib-acp-ui.agents` continues to work and overrides on name collision.

Binary download can land in a follow-up commit within this task, but npx/uvx resolution is required for v1.

https://github.com/agentclientprotocol/registry/releases/download/v2026.07.04-386a2ae/registry.json

## Why

Agents are configured only via hand-written settings today:

```json
"ib-acp-ui.agents": [
  { "name": "Gemini", "command": "gemini", "args": ["--acp"] }
]
```

The [ACP Registry](https://agentclientprotocol.com/get-started/registry) is stabilized.
It publishes curated manifests with distribution metadata (`npx`, `uvx`, `binary`), icons, and versions at a stable CDN URL.
Other ACP clients are expected to consume this catalog.
ACP UI should too.

Protocol docs in this repo:

- `docs/acp/rfds/acp-agent-registry.mdx`
- `docs/acp/get-started/registry.mdx`

## Current extension behavior

| Touchpoint | File | Today |
| --- | --- | --- |
| Agent shape | `src/acp/domain/agentSpawnConfig.ts` | `name`, `command`, `args`, `env?`, `authMethodId?` |
| Config load | `src/acp/config/vscodeSettingsAgents.ts` | Reads `ib-acp-ui.agents` only |
| New chat | `src/extension/acpUiPanel.ts` | `pickAcpAgentConfig()` then `openNewAcpUi()` |
| Agent picker | `src/extension/acpUiAgentPicker.ts` | `showQuickPick` over settings names |
| Session init | `src/extension/acpUiSessionController.ts` | `availableAcpAgents` from settings |
| Agent switch | `src/extension/acpUiSessionController.ts` | `setSessionAgent` looks up by name in settings |
| Webview state | `webview/acp-ui/src/chatReducer.ts` | `acpAgentSelection` exists |
| Webview UI | `webview/acp-ui/src/components/ChatComposer.tsx` | Model picker only, no agent picker wired |
| Commands | `package.json` | No registry commands |
| Standalone | `standalone/server.ts` | `standalone/acp-agent.json` only |

No registry code exists under `src/` or `webview/` yet.

## Extension integration map

Every place that reads or lists agents must go through a single merged source after this task.

```text
                    +------------------+
                    |  registry CDN    |
                    +--------+---------+
                             |
                    fetch + cache (TTL)
                             |
              +--------------v---------------+
              |  src/acp/registry/           |
              |  resolve npx / uvx / binary  |
              +--------------+---------------+
                             |
              +--------------v---------------+
              |  globalStorage install map   |
              +--------------+---------------+
                             |
         +-------------------+-------------------+
         |                                       |
  ib-acp-ui.agents (manual)              installed registry agents
         |                                       |
         +-------------------+-------------------+
                             |
              +--------------v---------------+
              |  getAcpAgentConfigsMerged()  |  <-- single API for extension
              +--------------+---------------+
                             |
     +-----------+-----------+-----------+-----------+
     |           |           |           |           |
 acpUiAgent  acpUiSession  acpUiPanel  standalone  (future)
 Picker      Controller    empty-state server
```

### Files to add

| Path | Role |
| --- | --- |
| `src/acp/registry/types.ts` | Registry catalog and agent manifest types |
| `src/acp/registry/fetchRegistry.ts` | HTTP fetch with timeout |
| `src/acp/registry/cacheRegistry.ts` | `globalStorage/registry/catalog.json` + TTL |
| `src/acp/registry/resolveDistribution.ts` | Manifest -> `AcpAgentSpawnConfig` |
| `src/acp/registry/binaryInstall.ts` | Download/extract binary agents (phase 2) |
| `src/acp/registry/mergeAgents.ts` | Manual + installed merge and dedup |
| `src/acp/registry/fixtures/registry.sample.json` | CI fixture, no live CDN in tests |
| `src/extension/acpUiInstalledAgents.ts` | Persist install map in global storage |
| `src/extension/acpUiRegistry.ts` | Browse/install/uninstall/refresh commands |
| `webview/acp-ui/src/components/AgentPicker.tsx` | Composer agent dropdown (standalone parity) |

### Files to change

| Path | Change |
| --- | --- |
| `src/acp/config/vscodeSettingsAgents.ts` | Export manual-only helper, or delegate to merge module |
| `src/extension/acpUiAgentPicker.ts` | Use merged list, add "Browse Agent Registry..." entry |
| `src/extension/acpUiPanel.ts` | Register registry commands, empty-agents onboarding |
| `src/extension/acpUiSessionController.ts` | Merged list for init and `setSessionAgent` |
| `webview/acp-ui/src/components/ChatComposer.tsx` | Render `AgentPicker` when selection is unlocked |
| `webview/acp-ui/src/AcpUiApp.tsx` | Wire `postSetSessionAgent` (if not already) |
| `package.json` | Settings, commands, menus |
| `README.md` | Registry install section |

`standalone/server.ts` is optional for dev parity.
Prefer it if the change is small (read install map or env override).

## Registry data

**URL:**

```text
https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
```

**Distribution -> spawn config:**

| Registry | Spawn |
| --- | --- |
| `npx.package` | `command: "npx"`, `args: ["-y", package, ...manifest.args]` |
| `uvx.package` | `command: "uvx"`, `args: [package, ...manifest.args]` |
| `binary.<target>` | Download archive to global storage, `command` = absolute path to extracted `cmd` |

Platform target from `process.platform` + `process.arch`:

| Platform | Arch | Target key |
| --- | --- | --- |
| `darwin` | `arm64` | `darwin-aarch64` |
| `darwin` | `x64` | `darwin-x86_64` |
| `linux` | `arm64` | `linux-aarch64` |
| `linux` | `x64` | `linux-x86_64` |
| `win32` | `arm64` | `windows-aarch64` |
| `win32` | `x64` | `windows-x86_64` |

Prefer `npx` over `uvx` over `binary` when multiple are present.

## Install persistence

Store registry installs in extension global storage, not in user `settings.json`.

```json
{
  "schemaVersion": 1,
  "agents": {
    "claude-acp": {
      "registryId": "claude-acp",
      "installedVersion": "0.55.0",
      "spawn": {
        "name": "Claude Agent",
        "command": "npx",
        "args": ["-y", "@agentclientprotocol/claude-agent-acp@0.55.0"]
      }
    }
  }
}
```

Merge rules:

1. Manual `ib-acp-ui.agents` entries always win on matching `name`.
2. Installed registry agents fill the rest of the picker.
3. On duplicate registry display names, suffix with ` (<id>)`.

Extend `AcpAgentSpawnConfig` internally with optional `registryId?: string` for update/uninstall targeting.
Do not require `registryId` in user-edited settings JSON.

## User-facing extension surfaces

### New commands (`package.json`)

| Command ID | Title | Behavior |
| --- | --- | --- |
| `ib-acp-ui.browseAgentRegistry` | Browse Agent Registry | Quick pick catalog, install selected agent |
| `ib-acp-ui.refreshAgentRegistry` | Refresh Agent Registry | Bypass cache TTL, refetch CDN |
| `ib-acp-ui.uninstallRegistryAgent` | Uninstall Registry Agent | Remove one install by registry id |

Register under category `IrishBruse ACP`.
Add **Browse Agent Registry** to the Chats view title menu next to existing new-chat actions.

### Browse flow (VS Code quick pick)

Use native quick pick for v1 (fits extension patterns, no new webview panel).

1. Load catalog (cache first, background refresh if stale).
2. Show one row per agent: `$(cloud-download) Name vX.Y.Z - description snippet`.
3. On pick, show secondary pick: **Install**, **View on registry site**, **Cancel**.
4. **Install** resolves distribution, writes install map, toast success.
5. If already installed, show **Reinstall** / **Uninstall** instead.

Icons from CDN are nice-to-have in quick pick (VS Code supports `iconPath` from URI).
Skip webview catalog page unless quick pick proves too cramped.

### Agent picker integration

Update `pickAcpAgentConfig()`:

- List merged agents (manual + installed).
- Prefix manual entries with `$(settings-gear)` or label `(custom)`.
- Prefix registry entries with `$(package)` or label `(registry)`.
- Append separator + **Browse Agent Registry...** when registry is enabled.

When no agents exist at all, `acpUiPanel.ts` should offer **Browse Agent Registry** instead of only "add settings".

### Session and webview integration

- `buildInitPayload`: `availableAcpAgents` from merged list.
- `setSessionAgent`: resolve from merged list (already looks up by name).
- Wire `AgentPicker` in `ChatComposer` when `acpAgentSelection` is set and `lockSessionAgent` is false (standalone pre-flight).
- Post `setSessionAgent` from webview on change, same as model picker.

### Settings (`package.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `ib-acp-ui.registry.enabled` | `true` | Turn registry fetch/install off |
| `ib-acp-ui.registry.url` | CDN latest URL | Override for testing |
| `ib-acp-ui.registry.cacheTtlHours` | `24` | Catalog cache lifetime |

### Onboarding (recommended)

When `getAcpAgentConfigsMerged()` returns empty and registry is enabled:

1. Show information message: "No ACP agents configured. Browse the registry?"
2. Actions: **Browse Registry**, **Open Settings**.

Keep existing Cursor/Gemini defaults in `package.json` for now so fresh installs still work out of the box.
Onboarding mainly helps users who cleared defaults.

## Out of scope

- Contributing agents to the upstream registry repo.
- Terminal-auth or env_var-auth agents (ACP UI supports agent auth only today).
- Replacing manual settings (both coexist).
- Full registry website feature parity (filters, search facets).
- Auto-update installed agents on every extension activate (manual refresh/reinstall is enough for v1).

## Implementation checklist

### Core (required for task completion)

- [ ] `src/acp/registry/` module with types, fetch, cache, resolve (npx + uvx).
- [ ] Install map read/write in `acpUiInstalledAgents.ts`.
- [ ] `getAcpAgentConfigsMerged()` used everywhere agents are listed or resolved.
- [ ] Commands: browse, refresh, uninstall registered and wired in `acpUiPanel.ts`.
- [ ] `pickAcpAgentConfig()` shows merged agents + browse entry.
- [ ] `acpUiSessionController` init and `setSessionAgent` use merged list.
- [ ] Settings keys in `package.json`.
- [ ] Unit tests with `registry.sample.json` fixture.
- [ ] README section for registry install.
- [ ] `npm run verify` passes.

### Extension UI (required for task completion)

- [ ] Browse/install flow works end-to-end from command palette.
- [ ] Installed agent appears in new-chat picker and spawns successfully.
- [ ] `AgentPicker` in webview composer (when agent not session-locked).

### Binary distribution (follow-up within task, not blocking v1)

- [ ] `binaryInstall.ts`: download, extract, prune old versions.
- [ ] Install enabled for binary-only agents on supported platforms.
- [ ] Clear error when platform unsupported or archive fetch fails.

### Polish (nice to have)

- [ ] Changelog entry.
- [ ] Standalone server reads install map for dev parity.
- [ ] "Update available" hint when catalog version > installed version.

## Edge cases

| Case | Behavior |
| --- | --- |
| CDN unreachable | Use cache, show one warning toast |
| Agent removed from catalog | Keep local install, allow uninstall |
| Manual + registry same `name` | Manual wins, registry row hidden |
| `npx` missing on PATH | Block install with clear message |
| Auth unsupported | Allow install, warn that agent auth may fail at spawn |

## Definition of done

The task is complete when all of the following are true:

1. A user with only default settings can run **Browse Agent Registry**, install an npx-based agent, and start a chat with it without editing JSON settings.
2. A user with manual `ib-acp-ui.agents` entries still sees and can use them.
3. Registry fetch failures do not break the extension (cached catalog or empty catalog with message).
4. New registry code has automated tests, no live network in CI.
5. User-facing copy says **ACP** / **ACP UI**, never APC.

## References

- CDN: `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
- Repo: `https://github.com/agentclientprotocol/registry`
- Schema: `https://github.com/agentclientprotocol/registry/blob/main/agent.schema.json`
- Spawn config: `src/acp/domain/agentSpawnConfig.ts`
