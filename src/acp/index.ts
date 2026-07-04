/**
 * Public surface for ACP integration. Import from here in extension entrypoints and in sibling packages
 * during migration instead of reaching into deep paths.
 */

export {
    type AcpAgentConfig,
    getAcpAgentConfigByName,
    getAcpAgentConfigsFromSettings,
} from "./config/vscodeSettingsAgents";
export type { AcpAgentSpawnConfig } from "./domain/agentSpawnConfig";
export {
    parseAcpAgentSpawnConfig,
    parseAcpAgentsJsonFileContent,
    resolveAuthMethodId,
} from "./domain/agentSpawnConfig";
export type {
    AcpAgentProcessOptions,
    RequestPermissionHandler,
    SessionUpdateHandler,
} from "./infrastructure/acpAgentProcess";
export { AcpAgentProcess } from "./infrastructure/acpAgentProcess";
export {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    sessionUpdateToWebviewMessages,
    type ToolCallKindTracking,
    toolCallExecuteCommandSubtitle,
    toolCallSubtitleFromToolCall,
    toolCallUpdateSubtitleHint,
} from "./mapping/sessionUpdateMapping";
export { computeToolCallDiffRows } from "./mapping/toolCallDiffLines";
export type { AcpHostFilesystem } from "./ports/hostFilesystem";
export type { AcpRpcNdjsonSink } from "./ports/rpcNdjsonSink";
export { NullAcpRpcNdjsonSink } from "./ports/rpcNdjsonSink";
export {
    AcpSessionBridge,
    type AcpSessionHostRuntime,
    type PostToWebview,
} from "./session/acpSessionBridge";
export {
    type AcpUiSessionModelSelection,
    sessionModelStateToAcpUiSelection,
} from "./session/sessionModels";
