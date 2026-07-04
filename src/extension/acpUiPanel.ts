import {
    type ExtensionContext,
    RelativePattern,
    ThemeIcon,
    ViewColumn,
    type WebviewPanel,
    window,
    workspace,
} from "vscode";
import {
    type AcpAgentConfig,
    getAcpAgentConfigByName,
    getAcpAgentConfigsFromSettings,
} from "../acp/config/vscodeSettingsAgents";
import { AcpSessionBridge } from "../acp/session/acpSessionBridge";
import { formatPathWithTilde } from "../platform/pathDisplay";
import { createDefaultAcpSessionHostRuntime } from "../platform/vscode/defaultHostRuntime";
import type { ExtensionToWebviewMessage } from "../protocol/extensionHostMessages";
import { tryParseWebviewMessage } from "../protocol/extensionHostMessages";
import { registerCommandIB } from "../utils/vscode";
import {
    getDefaultAcpAgentConfig,
    pickAcpAgentConfig,
} from "./acpUiAgentPicker";
import {
    getAcpUiPromptHistoryEntries,
    setAcpUiPromptHistoryEntries,
} from "./acpUiPromptHistoryMemento";
import {
    addAcpUiSession,
    listAcpUiSessions,
    renameAcpUiSession,
    setAcpUiSessionAgentName,
    setAcpUiSessionRuntimeSessionId,
    setActiveAcpUiSessionId,
    touchAcpUiSession,
} from "./acpUiSessionsStore";
import { getAcpUiWebviewHtml } from "./acpUiWebviewShell";
import { getAcpUiExtensionActivation } from "./extensionServices";

const editorViewType = "ibAcpUiWebviewEditor";

/** Tab / panel icon (codicon chat bubble). */
const acpUiPanelTabIcon = new ThemeIcon("comment-discussion");

const panelsBySessionId = new Map<string, WebviewPanel>();
const bridgesBySessionId = new Map<string, AcpSessionBridge>();
const pendingModelIdBySessionId = new Map<string, string>();
const agentConfigBySessionId = new Map<string, AcpAgentConfig | undefined>();
let refreshChatsListHandler: (() => void) | undefined;
const maxWorkspaceFileAutocompleteEntries = 1500;

async function workspaceFilesForAutocomplete(): Promise<string[] | undefined> {
    const folder = workspace.workspaceFolders?.[0];
    if (folder === undefined) {
        return undefined;
    }
    const uris = await workspace.findFiles(
        new RelativePattern(folder, "**/*"),
        new RelativePattern(
            folder,
            "**/{node_modules,.git,dist,build,out,coverage,.next}/**",
        ),
        maxWorkspaceFileAutocompleteEntries,
    );
    const files = uris
        .map((uri) => workspace.asRelativePath(uri, false))
        .filter((p) => p.length > 0)
        .sort((a, b) => a.localeCompare(b));
    return files.length > 0 ? files : undefined;
}

export function renameAcpUiSessionTitle(
    sessionId: string,
    nextTitle: string,
): boolean {
    const renamed = renameAcpUiSession(sessionId, nextTitle);
    if (!renamed) {
        return false;
    }
    const panel = panelsBySessionId.get(sessionId);
    if (panel !== undefined) {
        panel.title = nextTitle.trim();
    }
    refreshChatsListHandler?.();
    return true;
}

function disposeBridgeForSession(sessionId: string): void {
    const bridge = bridgesBySessionId.get(sessionId);
    if (bridge !== undefined) {
        bridge.dispose();
        bridgesBySessionId.delete(sessionId);
    }
}

function postForSession(
    sessionId: string,
    msg: ExtensionToWebviewMessage,
): void {
    const panel = panelsBySessionId.get(sessionId);
    if (panel !== undefined) {
        void panel.webview.postMessage(msg);
    }
}

async function ensureBridgeConnected(
    sessionId: string,
): Promise<AcpSessionBridge | undefined> {
    const existing = bridgesBySessionId.get(sessionId);
    if (existing !== undefined) {
        return existing;
    }
    const config =
        agentConfigBySessionId.get(sessionId) ??
        getAcpAgentConfigsFromSettings()[0];
    if (config === undefined) {
        postForSession(sessionId, {
            type: "error",
            message:
                "No ACP agents configured. Add entries to the ib-acp-ui.agents setting (name, command, optional args).",
        });
        return undefined;
    }
    const { rpcNdjsonSink } = getAcpUiExtensionActivation();
    const host = createDefaultAcpSessionHostRuntime(rpcNdjsonSink);
    const bridge = new AcpSessionBridge(
        config,
        (msg) => postForSession(sessionId, msg),
        host,
    );
    bridgesBySessionId.set(sessionId, bridge);
    const preferred = pendingModelIdBySessionId.get(sessionId);
    pendingModelIdBySessionId.delete(sessionId);
    try {
        await bridge.connect(preferred);
        const runtimeSessionId = bridge.sessionId;
        if (runtimeSessionId !== null) {
            setAcpUiSessionRuntimeSessionId(sessionId, runtimeSessionId);
        }
        return bridge;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        window.showErrorMessage(`Failed to connect to agent: ${message}`);
        postForSession(sessionId, {
            type: "error",
            message: `Failed to connect to agent: ${message}`,
        });
        bridge.dispose();
        bridgesBySessionId.delete(sessionId);
        return undefined;
    }
}

/**
 * Reveals an existing editor webview for the session or creates one with the given title.
 */
export function openOrRevealAcpUiEditor(
    context: ExtensionContext,
    sessionId: string,
    title: string,
    agentConfig?: AcpAgentConfig,
): void {
    const existing = panelsBySessionId.get(sessionId);
    if (existing !== undefined) {
        existing.title = title;
        existing.iconPath = acpUiPanelTabIcon;
        existing.reveal(ViewColumn.Active);
        touchAcpUiSession(sessionId);
        refreshChatsListHandler?.();
        return;
    }
    agentConfigBySessionId.set(sessionId, agentConfig);
    const panel = window.createWebviewPanel(
        editorViewType,
        title,
        ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri],
        },
    );
    panel.webview.html = getAcpUiWebviewHtml(
        context.extensionUri,
        panel.webview,
    );
    panel.iconPath = acpUiPanelTabIcon;

    const post = (msg: ExtensionToWebviewMessage): void => {
        void panel.webview.postMessage(msg);
    };

    panel.webview.onDidReceiveMessage((message: unknown) => {
        const parsed = tryParseWebviewMessage(message);
        if (parsed === null) {
            return;
        }

        if (parsed.type === "ready") {
            void Promise.resolve().then(async () => {
                const pkg = context.extension.packageJSON as {
                    version?: string;
                };
                const versionRaw = pkg.version;
                const agentVersionLabel =
                    typeof versionRaw === "string" && versionRaw.length > 0
                        ? `v${versionRaw}`
                        : undefined;
                const folder = workspace.workspaceFolders?.[0];
                const workspaceLabel =
                    folder !== undefined
                        ? formatPathWithTilde(folder.uri.fsPath)
                        : undefined;
                const configs = getAcpAgentConfigsFromSettings();
                const availableNames = configs.map((c) => c.name);
                const defaultAgent = agentConfig ?? configs[0];
                const promptHistory = getAcpUiPromptHistoryEntries(
                    context,
                    sessionId,
                );
                const workspaceFiles = await workspaceFilesForAutocomplete();
                const initPayload: ExtensionToWebviewMessage = {
                    type: "init",
                    sessionId,
                    title,
                    workspaceLabel,
                    agentVersionLabel,
                    acpAgentName: defaultAgent?.name,
                    lockSessionAgent: true,
                    ...(workspaceFiles !== undefined ? { workspaceFiles } : {}),
                    ...(availableNames.length > 0
                        ? { availableAcpAgents: availableNames }
                        : {}),
                    ...(promptHistory.length > 0 ? { promptHistory } : {}),
                };
                void post(initPayload);
                void ensureBridgeConnected(sessionId);
            });
            return;
        }

        if (parsed.type === "resetSession") {
            disposeBridgeForSession(sessionId);
            pendingModelIdBySessionId.delete(sessionId);
            post({ type: "sessionReset" });
            void ensureBridgeConnected(sessionId);
            return;
        }

        if (parsed.type === "savePromptHistory") {
            setAcpUiPromptHistoryEntries(context, sessionId, parsed.entries);
            return;
        }

        if (parsed.type === "send") {
            void (async () => {
                const b = await ensureBridgeConnected(sessionId);
                if (b !== undefined) {
                    if (b.isPrompting) {
                        await b.cancel();
                    }
                    await b.prompt(parsed.body);
                }
            })();
            return;
        }

        if (parsed.type === "cancel") {
            void bridgesBySessionId.get(sessionId)?.cancel();
            return;
        }
        if (parsed.type === "renameSession") {
            const nextTitle = parsed.title.trim();
            if (nextTitle.length === 0) {
                post({
                    type: "commandFeedback",
                    message: "Usage: /rename <new-name>",
                });
                return;
            }
            const renamed = renameAcpUiSessionTitle(sessionId, nextTitle);
            post({
                type: "commandFeedback",
                message: renamed
                    ? `Renamed chat to "${nextTitle}".`
                    : "Rename failed for this chat.",
            });
            return;
        }

        if (parsed.type === "setSessionModel") {
            void (async () => {
                const b = bridgesBySessionId.get(sessionId);
                if (b !== undefined) {
                    try {
                        await b.setSessionModel(parsed.modelId);
                    } catch (err: unknown) {
                        const msg =
                            err instanceof Error ? err.message : String(err);
                        post({
                            type: "error",
                            message: `Model change failed: ${msg}`,
                        });
                    }
                } else {
                    pendingModelIdBySessionId.set(sessionId, parsed.modelId);
                }
            })();
            return;
        }

        if (parsed.type === "setSessionAgent") {
            const config = getAcpAgentConfigByName(parsed.agentName);
            if (config === undefined) {
                post({
                    type: "error",
                    message: `Unknown agent: ${parsed.agentName}`,
                });
                return;
            }
            agentConfigBySessionId.set(sessionId, config);
            setAcpUiSessionAgentName(sessionId, config.name);
            disposeBridgeForSession(sessionId);
            pendingModelIdBySessionId.delete(sessionId);
            const names = getAcpAgentConfigsFromSettings().map((c) => c.name);
            post({
                type: "acpAgentSelection",
                currentAgentName: config.name,
                availableAgentNames: names,
            });
            void ensureBridgeConnected(sessionId);
            return;
        }

        if (parsed.type === "permissionResponse") {
            bridgesBySessionId.get(sessionId)?.handlePermissionResponse(parsed);
            return;
        }
        if (parsed.type === "cursorAskQuestionResponse") {
            bridgesBySessionId
                .get(sessionId)
                ?.handleCursorAskQuestionResponse(parsed);
            return;
        }
        if (parsed.type === "cursorCreatePlanResponse") {
            bridgesBySessionId
                .get(sessionId)
                ?.handleCursorCreatePlanResponse(parsed);
        }
    });

    panel.onDidDispose(() => {
        panelsBySessionId.delete(sessionId);
        agentConfigBySessionId.delete(sessionId);
        disposeBridgeForSession(sessionId);
        pendingModelIdBySessionId.delete(sessionId);
    });

    panelsBySessionId.set(sessionId, panel);
    context.subscriptions.push(panel);
}

/**
 * Closes the editor webview for a session if it is open.
 */
export function disposeAcpUiEditorForSession(sessionId: string): void {
    const panel = panelsBySessionId.get(sessionId);
    panel?.dispose();
}

/**
 * Registers ACP UI commands. Pass {@link refreshChatsList} from {@link AcpUiSessionsViewProvider.activate}
 * so new chats update the sidebar tree.
 */
export function registerAcpUiPanel(
    context: ExtensionContext,
    refreshChatsList: () => void,
): void {
    refreshChatsListHandler = refreshChatsList;
    registerCommandIB(
        "ib-acp-ui.openChat",
        () => void openNewAcpUiWithDefaultAgent(context, refreshChatsList),
        context,
    );
    registerCommandIB(
        "ib-acp-ui.newAcpUiInEditor",
        () => void openNewAcpUiWithDefaultAgent(context, refreshChatsList),
        context,
    );
    registerCommandIB(
        "ib-acp-ui.newAcpUiInEditorPickAgent",
        () => void openNewAcpUiWithAgentPicker(context, refreshChatsList),
        context,
    );
    registerCommandIB(
        "ib-acp-ui.newAcpUiFromTitleMenu",
        () => void openNewAcpUiWithAgentPicker(context, refreshChatsList),
        context,
    );
}

async function openNewAcpUiWithDefaultAgent(
    context: ExtensionContext,
    refreshChatsList: () => void,
): Promise<void> {
    const agentConfig = getDefaultAcpAgentConfig();
    if (agentConfig === undefined) {
        window.showInformationMessage(
            "No ACP agents configured. Add entries to ib-acp-ui.agents in settings.",
        );
        return;
    }
    openNewAcpUi(context, refreshChatsList, agentConfig);
}

async function openNewAcpUiWithAgentPicker(
    context: ExtensionContext,
    refreshChatsList: () => void,
): Promise<void> {
    const agentConfig = await pickAcpAgentConfig();
    if (agentConfig === undefined) {
        return;
    }
    openNewAcpUi(context, refreshChatsList, agentConfig);
}

function openNewAcpUi(
    context: ExtensionContext,
    refreshChatsList: () => void,
    agentConfig: AcpAgentConfig,
): void {
    const nextIndex = listAcpUiSessions().length + 1;
    const created = addAcpUiSession(`Chat ${nextIndex}`, {
        agentName: agentConfig.name,
    });
    setActiveAcpUiSessionId(created.id);
    openOrRevealAcpUiEditor(context, created.id, created.title, agentConfig);
    refreshChatsList();
}
