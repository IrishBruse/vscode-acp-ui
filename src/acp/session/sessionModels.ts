import type { SessionMode, SessionModeState } from "@agentclientprotocol/sdk";

/**
 * Serializable model list for a chat UI. Matches `sessionModels` in standalone mocks.
 */
export type AcpUiSessionModelSelection = {
    currentModelId: string;
    availableModels: Array<
        Pick<{ modelId: string; name: string }, "modelId" | "name">
    >;
};

/**
 * Converts agent `SessionModeState` to the webview payload shape.
 */
export function sessionModelStateToAcpUiSelection(
    state: SessionModeState,
): AcpUiSessionModelSelection {
    return {
        currentModelId: state.currentModeId,
        availableModels: state.availableModes.map((mode: SessionMode) => ({
            modelId: mode.id,
            name: mode.name,
        })),
    };
}
