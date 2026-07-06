import type { RefObject } from "react";
import type { WorkspacePathOpenTarget } from "../../../src/protocol/extensionHostMessages";
import { createRoot } from "react-dom/client";
import type { ChatState, ExtensionMessageAfterInit, InitPayload } from "./chatReducer";
import { AcpUiApp } from "./AcpUiApp";

export type { ExtensionMessageAfterInit, InitPayload } from "./chatReducer";

export type ChatView = {
    handleMessage(message: ExtensionMessageAfterInit): void;
};

/**
 * Mounts the ACP UI into `root`. Returns a view handle whose `handleMessage`
 * must be called for every non-init message received from the host.
 */
export function mountChatView(
    root: HTMLElement,
    init: InitPayload,
    postSend: (body: string) => void,
    postCancel: () => void,
    postRenameSession: (title: string) => void,
    postResetSession: () => void,
    postSetSessionModel: (modelId: string) => void,
    postSetSessionConfigOption: (
        configId: string,
        value: string | boolean,
    ) => void,
    postSaveHistory: (entries: string[]) => void,
    postPermissionResponse: (
        payload:
            | { requestId: string; selectedOptionId: string }
            | { requestId: string; cancelled: true },
    ) => void,
    postCursorAskQuestionResponse: (payload: {
        requestId: string;
        outcome:
            | {
                  outcome: "answered";
                  answers: Array<{
                      questionId: string;
                      selectedOptionIds: string[];
                  }>;
              }
            | { outcome: "skipped"; reason?: string }
            | { outcome: "cancelled" };
    }) => void,
    postCursorCreatePlanResponse: (payload: {
        requestId: string;
        outcome:
            | { outcome: "accepted"; planUri?: string }
            | { outcome: "rejected"; reason?: string }
            | { outcome: "cancelled" };
    }) => void,
    initialChatState?: ChatState,
    postOpenNewChat?: () => void,
    postOpenWorkspacePath?: (
        path: string,
        options?: { target?: WorkspacePathOpenTarget },
    ) => void,
): ChatView {
    root.replaceChildren();
    root.className = "root agent-root";
    const extensionDispatchRef: RefObject<
        ((message: ExtensionMessageAfterInit) => void) | null
    > = {
        current: null,
    };
    const reactRoot = createRoot(root);
    reactRoot.render(
        <AcpUiApp
            init={init}
            initialChatState={initialChatState}
            postSend={postSend}
            postCancel={postCancel}
            postRenameSession={postRenameSession}
            postResetSession={postResetSession}
            postSetSessionModel={postSetSessionModel}
            postSetSessionConfigOption={postSetSessionConfigOption}
            postSaveHistory={postSaveHistory}
            postOpenNewChat={postOpenNewChat}
            postOpenWorkspacePath={postOpenWorkspacePath}
            postPermissionResponse={postPermissionResponse}
            postCursorAskQuestionResponse={postCursorAskQuestionResponse}
            postCursorCreatePlanResponse={postCursorCreatePlanResponse}
            extensionDispatchRef={extensionDispatchRef}
        />,
    );
    return {
        handleMessage(message: ExtensionMessageAfterInit): void {
            extensionDispatchRef.current?.(message);
        },
    };
}
