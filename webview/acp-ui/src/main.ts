import type {
    AcpUiHistoryReplayEvent,
    ExtensionToWebviewMessage,
} from "../../../src/protocol/extensionHostMessages";
import "./global.css";
import "./boot.css";
import { replayChatState } from "./chatReducer";
import { createVsCodeAcpUiHost } from "./host";
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
bootLine.textContent = "Connecting…";
mount.appendChild(bootLine);

const host = createVsCodeAcpUiHost();
let view: ChatView | null = null;
let initReceived = false;
let pendingInit: InitPayload | null = null;
let pendingHistory: AcpUiHistoryReplayEvent[] | undefined;

function tryMountView(): void {
    if (view !== null || pendingInit === null) {
        return;
    }
    initReceived = true;
    clearTimeout(initRetryTimer);
    const initialChatState =
        pendingHistory !== undefined && pendingHistory.length > 0
            ? replayChatState(pendingInit, pendingHistory)
            : undefined;
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
    );
}

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
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
