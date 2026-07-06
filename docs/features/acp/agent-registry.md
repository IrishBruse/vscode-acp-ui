# Agent Registry

## User facing

Planned: browse the official ACP agent catalog from the extension.
Install agents without hand-editing `settings.json`.
Start chats with installed registry agents from the same picker as manual entries.

Manual `ib-acp-ui.agents` settings continue to work and override on name collision.

Not shipped yet.

## Implementation

Not implemented.
No code under `src/acp/registry/` yet.
The task defines fetch/cache, npx/uvx resolution, global storage install map, merged agent list API, commands, and webview agent picker.

Task: [acp-registry](../../tasks/acp-registry.md).
Protocol: [ACP agent registry](../../acp/rfds/acp-agent-registry.mdx), [get started registry](../../acp/get-started/registry.mdx).
