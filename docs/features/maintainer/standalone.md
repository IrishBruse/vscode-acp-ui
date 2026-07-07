# Standalone dev server

## User facing

This surface is for extension developers, not end users.

Run `npm run dev:standalone` to develop the chat webview in a browser without installing the VS Code extension.
A Vite dev server serves the UI on port 5173.
A WebSocket bridge on port 5174 reuses the same [AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts) and protocol mapping as the extension.

`npm run dev:standalone:demo` runs without a live agent.
Browse fixture chats and model-picker seeds at `/fixtures`.
Send `fixture-markdown`, `fixture-tools`, or `fixture-plan` in the composer to replay samples.

Set `ACP_UI_DEMO_SEED=opus-model` to preview the agent-ordered model toolbar.
Set `ACP_UI_VSCODE_SETTINGS` to point at a VS Code `settings.json` for workbench colors and markdown syntax.

## Implementation

### Server bridge

[standalone/server.ts](../../../standalone/server.ts) hosts the HTTP and WebSocket server.
It configures client info from `package.json`.
When not in demo mode it spawns agents from `standalone/agents.json`.
It forwards webview messages through the same [tryParseWebviewMessage](../../../src/protocol/extensionHostMessages.ts) path as the extension.

Demo mode replays [ReadmeSessionSeed](../../../src/acp/session/readmeSessionSeed.ts) fixtures from `standalone/fixtures/`.

### Theme and markdown

[resolveStandaloneThemeCssVariables](../../../src/platform/node/resolveStandaloneThemeCssVariables.ts) reads VS Code user settings for workbench colors.
[pickWebviewMarkdownThemeVariables](../../../src/platform/markdownThemeResolver.ts) builds CSS variables for the webview bootstrap.

### RPC logging in standalone

When `ACP_RPC_LOG` is unset, RPC lines append to `standalone/acp-rpc.ndjson` via [FileAcpRpcNdjsonSink](../../../src/platform/node/fileRpcNdjsonSink.ts).
See [rpc-logging](./rpc-logging.md).

### Screenshots

`npm run screenshots` builds fixtures and captures README images via Playwright scripts under `scripts/`.
