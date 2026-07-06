import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from "../../src/protocol/extensionHostMessages";
import "../../webview/acp-ui/src/global.css";
import type { InitPayload } from "../../webview/acp-ui/src/chatReducer";
import { setCompactToolPathHome } from "../../webview/acp-ui/src/toolCallCompactText";
import { type ChatView, mountChatView } from "../../webview/acp-ui/src/ui";
import { applyStandaloneVsCodeTheme } from "./standaloneTheme";

const WS_URL = `ws://${location.host}/__acp_ui_ws`;

function readDemoParamsFromUrl(): Pick<
    Extract<WebviewToExtensionMessage, { type: "ready" }>,
    "demoFixture" | "demoSeed" | "demoReplay"
> {
    const params = new URLSearchParams(location.search);
    const demoFixture = params.get("fixture");
    const demoSeed = params.get("seed");
    const replay = params.get("replay");
    const out: Pick<
        Extract<WebviewToExtensionMessage, { type: "ready" }>,
        "demoFixture" | "demoSeed" | "demoReplay"
    > = {};
    if (demoFixture !== null && demoFixture.length > 0) {
        out.demoFixture = demoFixture;
    }
    if (demoSeed !== null && demoSeed.length > 0) {
        out.demoSeed = demoSeed;
    }
    if (replay !== null) {
        out.demoReplay = replay !== "0" && replay !== "false";
    }
    return out;
}

function mountStandaloneDevNav(): void {
    if (!import.meta.env.DEV) {
        return;
    }
    const link = document.createElement("a");
    link.href = "/fixtures";
    link.textContent = "Fixtures";
    link.setAttribute("aria-label", "Open fixture gallery");
    link.style.cssText =
        "position:fixed;top:0.5rem;right:0.75rem;z-index:1000;color:#35a854;font:600 12px ui-monospace,Consolas,monospace;text-decoration:none;padding:0.25rem 0.5rem;border:1px solid #3a3f4b;border-radius:4px;background:#21252bcc;";
    document.body.appendChild(link);
}

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

function requireMountRoot(): HTMLElement {
    const el = document.getElementById("root");
    if (!(el instanceof HTMLElement)) {
        throw new Error("Missing #root");
    }
    return el;
}

const mountRoot = requireMountRoot();

async function bootstrap(): Promise<void> {
    await applyStandaloneVsCodeTheme();
    const root = mountRoot;

    const host = createWebSocketHost();
    let view: ChatView | null = null;

    host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
        if (message.type === "init") {
            if (message.homeDir !== undefined && message.homeDir.length > 0) {
                setCompactToolPathHome(message.homeDir);
            }
            const workspaceLabel = message.workspaceLabel;
            const restored = loadStandalonePromptHistory(workspaceLabel);
            const initPayload: InitPayload =
                restored !== undefined && restored.length > 0
                    ? { ...message, promptHistory: restored }
                    : message;
            view = mountChatView(
                root,
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
                    host.post({
                        type: "setSessionConfigOption",
                        configId,
                        value,
                    });
                },
                (entries) => {
                    saveStandalonePromptHistory(workspaceLabel, entries);
                    host.post({ type: "savePromptHistory", entries });
                },
                (payload) => {
                    host.post({ type: "permissionResponse", ...payload });
                },
                (payload) => {
                    host.post({
                        type: "cursorAskQuestionResponse",
                        ...payload,
                    });
                },
                (payload) => {
                    host.post({ type: "cursorCreatePlanResponse", ...payload });
                },
                undefined,
                undefined,
                (path) => {
                    host.post({ type: "openWorkspacePath", path });
                },
            );
            return;
        }
        view?.handleMessage(message);
    });

    host.post({ type: "ready", ...readDemoParamsFromUrl() });
    mountStandaloneDevNav();
}

void bootstrap();
