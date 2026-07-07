# Permissions

## User facing

When an agent needs approval before running a tool, ACP UI shows a permission dialog above the composer.
The dialog names the tool (for example a shell command or file write) and lists the options the agent provided.
Pick an option to continue, or dismiss to cancel.

While a permission prompt is open, the composer is blocked so you cannot send another message until you respond.

## Implementation

### ACP callback

[AcpAgentProcess](../../../src/acp/infrastructure/acpAgentProcess.ts#L303-L304) registers `requestPermission` on the SDK client connection.
[AcpSessionBridge.queuePermissionRequest](../../../src/acp/session/acpSessionBridge.ts#L122-L135) assigns a request id, posts webview messages, and waits on a promise.

[handlePermissionResponse](../../../src/acp/session/acpSessionBridge.ts#L140-L165) resolves the waiter when the webview replies.
Dispose cancels all pending waiters.

### Webview dialog

[extensionMessagesForPermissionRequest](../../../src/acp/mapping/sessionUpdateMapping.ts#L126-L160) builds `permissionRequest` messages.
For execute-style tools it may also append a tool subtitle update when the shell line can be resolved.

[chatReducer](../../../webview/acp-ui/src/chatReducer.ts#L707-L718) stores `permissionPrompt` state.
[PermissionDialog](../../../webview/acp-ui/src/components/PermissionDialog.tsx#L18-L68) renders the modal strip.

[AcpUiApp](../../../webview/acp-ui/src/AcpUiApp.tsx#L643-L660) wires button handlers to `postPermissionResponse`.
[acpUiSessionController](../../../src/extension/acpUiSessionController.ts#L589) forwards responses to the bridge.

Protocol: [tool calls](../../acp/protocol/v1/tool-calls.mdx).
