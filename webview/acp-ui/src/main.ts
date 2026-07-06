import type {
    AcpUiHistoryReplayEvent,
    ExtensionToWebviewMessage,
} from "../../../src/protocol/extensionHostMessages";
import "./global.css";
import "./boot.css";
import { replayChatState, createChatStateFromInit, type ChatState } from "./chatReducer";
import { createVsCodeAcpUiHost } from "./host";
import { setCompactToolPathHome } from "./toolCallCompactText";
import { type ChatView, type InitPayload, mountChatView } from "./ui";

function isInitPayload(
    message: ExtensionToWebviewMessage,
): message is InitPayload {
    return message.type === "init";
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

mount.className = "root agent-root";
mount.replaceChildren();
const bootLine = document.createElement("div");
bootLine.className = "acp-ui-boot";
const bootSpinner = document.createElement("div");
bootSpinner.className = "acp-ui-boot__spinner";
bootSpinner.setAttribute("aria-hidden", "true");
const bootText = document.createElement("span");
bootText.textContent = "Connecting...";
bootLine.append(bootSpinner, bootText);
mount.appendChild(bootLine);

const host = createVsCodeAcpUiHost();
let view: ChatView | null = null;
let initReceived = false;
let pendingInit: InitPayload | null = null;
let pendingHistory: AcpUiHistoryReplayEvent[] | undefined;
let pendingSessionHistoryLoading = false;

function applyPendingSessionHistoryLoading(state: ChatState): ChatState {
    if (!pendingSessionHistoryLoading) {
        return state;
    }
    return { ...state, sessionHistoryLoading: true };
}

function tryMountView(): void {
    if (view !== null || pendingInit === null) {
        return;
    }
    initReceived = true;
    clearTimeout(initRetryTimer);
    if (pendingInit.homeDir !== undefined && pendingInit.homeDir.length > 0) {
        setCompactToolPathHome(pendingInit.homeDir);
    }
    const initialChatState =
        pendingHistory !== undefined && pendingHistory.length > 0
            ? applyPendingSessionHistoryLoading(
                  replayChatState(pendingInit, pendingHistory),
              )
            : applyPendingSessionHistoryLoading(
                  createChatStateFromInit(pendingInit),
              );
    view = mountChatView(
        mount as HTMLElement,
        pendingInit,
        (body) => {
            host.post({ type: "send", body });
        },
        () => {
            host.post({ type: "cancel" });
        },
        (title) => {
            host.post({ type: "renameSession", title });
        },
        () => {
            host.post({ type: "resetSession" });
        },
        (modelId) => {
            host.post({ type: "setSessionModel", modelId });
        },
        (configId, value) => {
            host.post({ type: "setSessionConfigOption", configId, value });
        },
        (entries) => {
            host.post({ type: "savePromptHistory", entries });
        },
        (payload) => {
            host.post({ type: "permissionResponse", ...payload });
        },
        (payload) => {
            host.post({ type: "cursorAskQuestionResponse", ...payload });
        },
        (payload) => {
            host.post({ type: "cursorCreatePlanResponse", ...payload });
        },
        initialChatState,
        () => {
            host.post({ type: "openNewChat" });
        },
        (path, options) => {
            host.post({
                type: "openWorkspacePath",
                path,
                ...(options?.target === "auto" ? { target: "auto" } : {}),
            });
        },
    );
}

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "sessionHistoryLoading") {
        if (view !== null) {
            view.handleMessage(message);
            return;
        }
        pendingSessionHistoryLoading = message.loading;
        if (message.loading) {
            bootText.textContent = "Loading conversation...";
        }
        return;
    }
    if (isInitPayload(message)) {
        if (view !== null) {
            return;
        }
        pendingInit = message;
        tryMountView();
        return;
    }
    if (message.type === "historyReplay") {
        if (view !== null) {
            return;
        }
        pendingHistory = message.events;
        tryMountView();
        return;
    }
    view?.handleMessage(message);
});

host.post({ type: "ready" });
const initRetryTimer = window.setTimeout(() => {
    if (!initReceived) {
        host.post({ type: "ready" });
    }
}, 750);
