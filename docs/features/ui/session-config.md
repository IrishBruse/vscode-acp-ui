# Session config

## User facing

When the connected agent advertises session configuration options, ACP UI shows a toolbar in the composer for model and tuning picks.

Cursor-style agents that use bracketed model ids show a family picker plus derived params.
An example id is `claude-4.6-sonnet-medium-thinking`, which exposes **Fast** and **Thinking** toggles.

Agents that send explicit `model_config` and related options use a Zed-style row of dropdowns in agent order.
That includes model, thinking, context, effort, and more.

A colored **session mode** label appears when the agent exposes a mode config option and the current value is not the default.

Picks lock after you send the first message in a turn so mid-run changes do not fight the agent.
Shift+Tab cycles the mode option when one is available.

## Implementation

### Config option normalization

[sessionConfigOptionsFromAgent](../../../src/acp/session/sessionConfigOptions.ts) converts ACP `SessionConfigOption` payloads into UI rows.
See [AcpUiSessionConfigOption](../../../src/acp/session/sessionConfigOptions.ts#L16-L33).

[buildModelId](../../../src/acp/session/modelVariantPicker.ts) handles Cursor bracketed model ids.
[parseModelIdBracketParams](../../../src/acp/session/modelVariantPicker.ts) maps derived boolean params (`fast`, `thinking`).

`config_option_update` in [sessionUpdateToWebviewMessages](../../../src/acp/mapping/sessionUpdateMapping.ts#L794-L806) refreshes options mid-session.

### Composer controls

[ConfigOptionControls](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx#L69-L162) renders select and boolean fields.
[ComposerConfigLoading](../../../webview/acp-ui/src/components/ConfigOptionControls.tsx#L29-L64) shows a disabled placeholder while options load.

[ModelConfigPopover](../../../webview/acp-ui/src/components/ModelConfigPopover.tsx) handles the Cursor-style family picker UI.

[SessionModeIndicator](../../../webview/acp-ui/src/components/SessionModeIndicator.tsx#L13-L28) reads mode metadata.
It calls [sessionModeIndicatorFromOption](../../../src/acp/session/sessionModeIndicator.ts).

### Applying picks to the agent

Webview posts `setSessionModel` and `setSessionConfigOption` messages.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts) forwards them to [AcpSessionBridge](../../../src/acp/session/acpSessionBridge.ts).

The bridge calls SDK `unstable_setSessionModel` and config-option setters.
[readCachedComposerSeed](../../../src/acp/session/sessionConfigOptionsCache.ts) restores cached param options when switching models.

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L556-L620) updates local selection state.
It locks picks after submit when `composerPicksLocked` is set.

### Client capability gate

Cursor spawn configs advertise the parameterized model picker meta flag during initialize.
[buildAcpClientCapabilities](../../../src/acp/infrastructure/acpAgentProcess.ts#L174-L186) builds that payload.
[isCursorAcpAgent](../../../src/acp/domain/agentSpawnConfig.ts) gates the path.
That unlocks agent-ordered config options from the Cursor agent.

Protocol: [session config options](../../acp/protocol/v1/session-config-options.mdx).
Related: [client](../acp/client.md).
