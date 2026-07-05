import {
    commands,
    type ExtensionContext,
    RelativePattern,
    type TextDocument,
    type Uri,
    type Webview,
    window,
    workspace,
} from "vscode";
import {
    type AcpAgentConfig,
    getAcpAgentConfigByName,
    getAcpAgentConfigsFromSettings,
} from "../acp/config/vscodeSettingsAgents";
import { CompositeAcpRpcNdjsonSink } from "../acp/ports/rpcNdjsonSink";
import { AcpSessionBridge } from "../acp/session/acpSessionBridge";
import { formatPathWithTilde } from "../platform/pathDisplay";
import { createDefaultAcpSessionHostRuntime } from "../platform/vscode/defaultHostRuntime";
import type {
    AcpUiHistoryReplayEvent,
    ExtensionToWebviewMessage,
} from "../protocol/extensionHostMessages";
import { tryParseWebviewMessage } from "../protocol/extensionHostMessages";
import { setAcpUiCustomEditorTabTitle } from "./acpUiCustomEditorProvider";
import { AcpUiSessionFileRpcSink } from "./acpUiSessionFileRpcSink";
import {
    type AcpUiSessionHeader,
    type AcpUiSessionReplayEvent,
    type AcpUiSessionSubmitEvent,
    appendSessionEvent,
    parseSessionFile,
    shouldPersistExtensionMessage,
    updateSessionHeader,
} from "./acpUiSessionJsonl";
import {
    renameAcpUiSession,
    setAcpUiSessionAgentName,
    setAcpUiSessionRuntimeSessionId,
} from "./acpUiSessionsStore";
import { getAcpUiExtensionActivation } from "./extensionServices";

const maxWorkspaceFileAutocompleteEntries = 1500;

type SessionControllerOptions = {
    context: ExtensionContext;
    document: TextDocument;
    webview: Webview;
    refreshChatsList?: () => void;
};

/**
 * Bridges one open session editor webview to an ACP agent and the session JSONL file.
 */
export class AcpUiSessionController {
    private readonly sessionId: string;
    private readonly documentUri: Uri;
    private bridge: AcpSessionBridge | undefined;
    private agentConfig: AcpAgentConfig | undefined;
    private pendingModelId: string | undefined;
    private replayedEventCount = 0;
    private documentReplayDepth = 0;
    private readonly disposables: Array<{ dispose(): void }> = [];

    constructor(private readonly options: SessionControllerOptions) {
        this.documentUri = options.document.uri;
        const parsed = parseSessionFile(options.document.getText());
        if (parsed.header === null) {
            throw new Error("Session file is missing a valid header line.");
        }
        this.sessionId = parsed.header.id;
        const configs = getAcpAgentConfigsFromSettings();
        const named = parsed.header.agentName;
        this.agentConfig =
            named !== undefined
                ? (getAcpAgentConfigByName(named) ?? configs[0])
                : configs[0];
        this.replayedEventCount = parsed.events.length;
    }

    activate(): void {
        this.disposables.push(
            workspace.onDidChangeTextDocument((event) => {
                if (
                    event.document.uri.toString() !==
                    this.documentUri.toString()
                ) {
                    return;
                }
                this.replayDocumentDelta(event.document);
            }),
        );
        this.disposables.push(
            this.options.webview.onDidReceiveMessage((message: unknown) => {
                void this.handleWebviewMessage(message);
            }),
        );
    }

    dispose(): void {
        this.disposeBridge();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    async sendBootstrapMessages(header: AcpUiSessionHeader): Promise<void> {
        const parsed = parseSessionFile(this.options.document.getText());
        const initPayload = await this.buildInitPayload(header);
        this.post({ type: "init", ...initPayload });
        if (parsed.events.length > 0) {
            this.post({
                type: "historyReplay",
                events: parsed.events as AcpUiHistoryReplayEvent[],
            });
        }
        void this.ensureBridgeConnected();
    }

    private async buildInitPayload(
        header: AcpUiSessionHeader,
    ): Promise<
        Omit<Extract<ExtensionToWebviewMessage, { type: "init" }>, "type">
    > {
        const { context, webview: _webview } = this.options;
        const pkg = context.extension.packageJSON as { version?: string };
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
        const defaultAgent = this.agentConfig ?? configs[0];
        const workspaceFiles = await workspaceFilesForAutocomplete();
        return {
            sessionId: header.id,
            title: header.title,
            workspaceLabel,
            agentVersionLabel,
            acpAgentName: defaultAgent?.name,
            lockSessionAgent: true,
            ...(workspaceFiles !== undefined ? { workspaceFiles } : {}),
            ...(availableNames.length > 0
                ? { availableAcpAgents: availableNames }
                : {}),
            ...(header.promptHistory !== undefined &&
            header.promptHistory.length > 0
                ? { promptHistory: header.promptHistory }
                : {}),
        };
    }

    private replayDocumentDelta(document: TextDocument): void {
        const parsed = parseSessionFile(document.getText());
        const events = parsed.events;
        if (events.length <= this.replayedEventCount) {
            if (events.length < this.replayedEventCount) {
                this.replayedEventCount = events.length;
            }
            return;
        }
        const delta = events.slice(this.replayedEventCount);
        this.replayedEventCount = events.length;
        if (this.documentReplayDepth > 0) {
            return;
        }
        for (const event of delta) {
            if (event.type === "submit") {
                continue;
            }
            this.postLive(event);
        }
    }

    private postLive(message: ExtensionToWebviewMessage): void {
        if (message.type === "init" || message.type === "historyReplay") {
            return;
        }
        void this.options.webview.postMessage(message);
    }

    private post(message: ExtensionToWebviewMessage): void {
        void this.options.webview.postMessage(message);
        void this.persistOutbound(message);
    }

    private async persistOutbound(
        message: ExtensionToWebviewMessage,
    ): Promise<void> {
        if (!shouldPersistExtensionMessage(message)) {
            return;
        }
        this.documentReplayDepth += 1;
        try {
            await appendSessionEvent(
                this.documentUri,
                message as Exclude<
                    AcpUiSessionReplayEvent,
                    AcpUiSessionSubmitEvent
                >,
            );
        } catch {
            // Best-effort persistence; UI still works in memory.
        } finally {
            this.documentReplayDepth -= 1;
        }
    }

    private async persistSubmit(body: string): Promise<void> {
        this.documentReplayDepth += 1;
        try {
            await appendSessionEvent(this.documentUri, {
                type: "submit",
                body,
            });
        } catch {
            // Best-effort.
        } finally {
            this.documentReplayDepth -= 1;
        }
    }

    private disposeBridge(): void {
        if (this.bridge !== undefined) {
            this.bridge.dispose();
            this.bridge = undefined;
        }
    }

    private async ensureBridgeConnected(): Promise<
        AcpSessionBridge | undefined
    > {
        if (this.bridge !== undefined) {
            return this.bridge;
        }
        const config = this.agentConfig ?? getAcpAgentConfigsFromSettings()[0];
        if (config === undefined) {
            this.post({
                type: "error",
                message:
                    "No ACP agents configured. Add entries to the ib-acp-ui.agents setting (name, command, optional args).",
            });
            return undefined;
        }
        const { rpcNdjsonSink } = getAcpUiExtensionActivation();
        const sessionRpcSink = new AcpUiSessionFileRpcSink(this.documentUri);
        const compositeRpcSink = new CompositeAcpRpcNdjsonSink([
            rpcNdjsonSink,
            sessionRpcSink,
        ]);
        const host = createDefaultAcpSessionHostRuntime(compositeRpcSink);
        const bridge = new AcpSessionBridge(
            config,
            (msg) => this.post(msg),
            host,
        );
        this.bridge = bridge;
        const preferred = this.pendingModelId;
        this.pendingModelId = undefined;
        try {
            await bridge.connect(preferred);
            const runtimeSessionId = bridge.sessionId;
            if (runtimeSessionId !== null) {
                void setAcpUiSessionRuntimeSessionId(
                    this.sessionId,
                    runtimeSessionId,
                );
            }
            return bridge;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            window.showErrorMessage(`Failed to connect to agent: ${message}`);
            this.post({
                type: "error",
                message: `Failed to connect to agent: ${message}`,
            });
            bridge.dispose();
            this.bridge = undefined;
            return undefined;
        }
    }

    private async handleWebviewMessage(message: unknown): Promise<void> {
        const parsed = tryParseWebviewMessage(message);
        if (parsed === null) {
            return;
        }

        if (parsed.type === "ready") {
            const header = parseSessionFile(
                this.options.document.getText(),
            ).header;
            if (header !== null) {
                await this.sendBootstrapMessages(header);
            }
            return;
        }

        if (parsed.type === "openNewChat") {
            void commands.executeCommand("ib-acp-ui.openChat");
            return;
        }

        if (parsed.type === "resetSession") {
            this.disposeBridge();
            this.pendingModelId = undefined;
            this.documentReplayDepth += 1;
            try {
                await appendSessionEvent(this.documentUri, {
                    type: "sessionReset",
                });
            } finally {
                this.documentReplayDepth -= 1;
            }
            this.postLive({ type: "sessionReset" });
            void this.ensureBridgeConnected();
            return;
        }

        if (parsed.type === "savePromptHistory") {
            void updateSessionHeader(this.documentUri, {
                promptHistory: parsed.entries,
            });
            return;
        }

        if (parsed.type === "send") {
            await this.persistSubmit(parsed.body);
            void (async () => {
                const b = await this.ensureBridgeConnected();
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
            void this.bridge?.cancel();
            return;
        }

        if (parsed.type === "renameSession") {
            const nextTitle = parsed.title.trim();
            if (nextTitle.length === 0) {
                this.post({
                    type: "commandFeedback",
                    message: "Usage: /rename <new-name>",
                });
                return;
            }
            const renamed = await renameAcpUiSession(this.sessionId, nextTitle);
            if (renamed) {
                setAcpUiCustomEditorTabTitle(this.documentUri, nextTitle);
                this.options.refreshChatsList?.();
            }
            this.post({
                type: "commandFeedback",
                message: renamed
                    ? `Renamed chat to "${nextTitle}".`
                    : "Rename failed for this chat.",
            });
            return;
        }

        if (parsed.type === "setSessionModel") {
            void (async () => {
                const b = this.bridge;
                if (b !== undefined) {
                    try {
                        await b.setSessionModel(parsed.modelId);
                    } catch (err: unknown) {
                        const msg =
                            err instanceof Error ? err.message : String(err);
                        this.post({
                            type: "error",
                            message: `Model change failed: ${msg}`,
                        });
                    }
                } else {
                    this.pendingModelId = parsed.modelId;
                }
            })();
            return;
        }

        if (parsed.type === "setSessionConfigOption") {
            void (async () => {
                const b = this.bridge;
                if (b === undefined) {
                    return;
                }
                try {
                    await b.setSessionConfigOption(
                        parsed.configId,
                        parsed.value,
                    );
                } catch (err: unknown) {
                    const msg =
                        err instanceof Error ? err.message : String(err);
                    this.post({
                        type: "error",
                        message: `Config change failed: ${msg}`,
                    });
                }
            })();
            return;
        }

        if (parsed.type === "setSessionAgent") {
            const config = getAcpAgentConfigByName(parsed.agentName);
            if (config === undefined) {
                this.post({
                    type: "error",
                    message: `Unknown agent: ${parsed.agentName}`,
                });
                return;
            }
            this.agentConfig = config;
            void setAcpUiSessionAgentName(this.sessionId, config.name);
            this.disposeBridge();
            this.pendingModelId = undefined;
            const names = getAcpAgentConfigsFromSettings().map((c) => c.name);
            this.post({
                type: "acpAgentSelection",
                currentAgentName: config.name,
                availableAgentNames: names,
            });
            void this.ensureBridgeConnected();
            return;
        }

        if (parsed.type === "permissionResponse") {
            this.bridge?.handlePermissionResponse(parsed);
            return;
        }
        if (parsed.type === "cursorAskQuestionResponse") {
            this.bridge?.handleCursorAskQuestionResponse(parsed);
            return;
        }
        if (parsed.type === "cursorCreatePlanResponse") {
            this.bridge?.handleCursorCreatePlanResponse(parsed);
        }
    }
}

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
