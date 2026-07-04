import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from "../../src/protocol/extensionHostMessages";
import "../../webview/acp-ui/src/global.css";
import type { InitPayload } from "../../webview/acp-ui/src/chatReducer";
import { type ChatView, mountChatView } from "../../webview/acp-ui/src/ui";

const WS_URL = `ws://${location.host}/__acp_ui_ws`;

function standalonePromptStorageKey(
    workspaceLabel: string | undefined,
): string {
    const base =
        workspaceLabel !== undefined && workspaceLabel.trim().length > 0
            ? workspaceLabel.trim()
            : "default";
    return `ib-acp-ui.standalone.promptHistory:${base}`;
}

function loadStandalonePromptHistory(
    workspaceLabel: string | undefined,
): string[] | undefined {
    try {
        const storage = globalThis.localStorage;
        if (storage === undefined) {
            return undefined;
        }
        const raw = storage.getItem(standalonePromptStorageKey(workspaceLabel));
        if (raw === null || raw.length === 0) {
            return undefined;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return undefined;
        }
        const entries = parsed.filter(
            (x): x is string => typeof x === "string",
        );
        return entries.length > 0 ? entries : undefined;
    } catch {
        return undefined;
    }
}

function saveStandalonePromptHistory(
    workspaceLabel: string | undefined,
    entries: string[],
): void {
    try {
        const storage = globalThis.localStorage;
        if (storage === undefined) {
            return;
        }
        storage.setItem(
            standalonePromptStorageKey(workspaceLabel),
            JSON.stringify(entries),
        );
    } catch {
        /* private mode or quota */
    }
}

function createWebSocketHost(): {
    post(message: WebviewToExtensionMessage): void;
    onExtensionMessage(
        handler: (message: ExtensionToWebviewMessage) => void,
    ): void;
} {
    const ws = new WebSocket(WS_URL);
    const pending: WebviewToExtensionMessage[] = [];
    let handler: ((message: ExtensionToWebviewMessage) => void) | null = null;

    ws.addEventListener("open", () => {
        for (const msg of pending) {
            ws.send(JSON.stringify(msg));
        }
        pending.length = 0;
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
        const parsed = JSON.parse(event.data) as ExtensionToWebviewMessage;
        handler?.(parsed);
    });

    ws.addEventListener("close", () => {
        handler?.({ type: "error", message: "WebSocket connection closed." });
    });

    ws.addEventListener("error", () => {
        handler?.({ type: "error", message: "WebSocket connection error." });
    });

    return {
        post(message: WebviewToExtensionMessage): void {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            } else {
                pending.push(message);
            }
        },
        onExtensionMessage(
            h: (message: ExtensionToWebviewMessage) => void,
        ): void {
            handler = h;
        },
    };
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

const host = createWebSocketHost();
let view: ChatView | null = null;

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "init") {
        const workspaceLabel = message.workspaceLabel;
        const restored = loadStandalonePromptHistory(workspaceLabel);
        const initPayload: InitPayload =
            restored !== undefined && restored.length > 0
                ? { ...message, promptHistory: restored }
                : message;
        view = mountChatView(
            mount,
            initPayload,
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
                saveStandalonePromptHistory(workspaceLabel, entries);
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
        );
        return;
    }
    view?.handleMessage(message);
});

host.post({ type: "ready" });
