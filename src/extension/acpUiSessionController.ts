import {
    commands,
    type ExtensionContext,
    RelativePattern,
    type TextDocument,
    Uri,
    type Webview,
    window,
    workspace,
} from "vscode";
import {
    contentWidthPercentSettingKey,
    readContentWidthRatioFromSettings,
} from "../acp/config/contentWidthRatioSetting";
import {
    readToolCallVerbosityFromSettings,
    toolCallVerbositySettingKey,
} from "../acp/config/toolCallVerbositySetting";
import {
    type AcpAgentConfig,
    getAcpAgentConfigByName,
    getAcpAgentConfigsFromSettings,
} from "../acp/config/vscodeSettingsAgents";
import { AcpSessionBridge } from "../acp/session/acpSessionBridge";
import { readCachedComposerSeed } from "../acp/session/sessionConfigOptionsCache";
import { openWorkspacePathTarget } from "../platform/openWorkspacePathTarget";
import { formatPathWithTilde } from "../platform/pathDisplay";
import { resolveUserHomeDir } from "../platform/resolveUserHomeDir";
import { resolveWorkspacePath } from "../platform/resolveWorkspacePath";
import { createDefaultAcpSessionHostRuntime } from "../platform/vscode/defaultHostRuntime";
import { resolveMarkdownThemeVariables } from "../platform/vscode/resolveMarkdownThemeVariables";
import type { ExtensionToWebviewMessage } from "../protocol/extensionHostMessages";
import { tryParseWebviewMessage } from "../protocol/extensionHostMessages";
import {
    moveAcpUiCustomEditorUri,
    setAcpUiCustomEditorTabTitle,
} from "./acpUiCustomEditorProvider";
import {
    type AcpUiSessionDocument,
    parseSessionFile,
    shouldDeferJsonlHistoryReplay,
    updateSessionHistory,
} from "./acpUiSessionJsonl";
import {
    clearAcpUiSessionRuntimeSessionId,
    getAcpUiSession,
    renameAcpUiSession,
    setAcpUiSessionAgentName,
    setAcpUiSessionRuntimeSessionId,
    updateAcpUiSessionTitle,
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
 * Bridges one open session editor webview to an ACP agent and the session `.acp` file.
 */
export class AcpUiSessionController {
    private readonly sessionId: string;
    private bridge: AcpSessionBridge | undefined;
    private bridgeConnectInFlight:
        | Promise<AcpSessionBridge | undefined>
        | undefined;
    private bridgeConnectGeneration = 0;
    private bootstrapSent = false;
    private agentConfig: AcpAgentConfig | undefined;
    private pendingModelId: string | undefined;
    private pendingConfigOption:
        | { configId: string; value: string | boolean }
        | undefined;
    private agentLoadInProgress = false;
    private readonly disposables: Array<{ dispose(): void }> = [];

    constructor(private readonly options: SessionControllerOptions) {
        const parsed = parseSessionFile(options.document.getText());
        if (parsed.header === null) {
            throw new Error("Session file is missing a valid header.");
        }
        this.sessionId = parsed.header.id;
        const configs = getAcpAgentConfigsFromSettings();
        const named = parsed.header.agentName;
        this.agentConfig =
            named !== undefined
                ? (getAcpAgentConfigByName(named) ?? configs[0])
                : configs[0];
    }

    private get documentUri(): Uri {
        return this.options.document.uri;
    }

    activate(): void {
        this.disposables.push(
            this.options.webview.onDidReceiveMessage((message: unknown) => {
                void this.handleWebviewMessage(message);
            }),
        );
        this.disposables.push(
            window.onDidChangeActiveColorTheme(() => {
                void this.postMarkdownThemeVariables();
            }),
        );
        this.disposables.push(
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(toolCallVerbositySettingKey)) {
                    this.postToolCallVerbosity();
                }
                if (event.affectsConfiguration(contentWidthPercentSettingKey)) {
                    this.postContentWidthRatio();
                }
                if (
                    event.affectsConfiguration("workbench.colorTheme") ||
                    event.affectsConfiguration(
                        "editor.tokenColorCustomizations",
                    ) ||
                    event.affectsConfiguration("editor.fontSize") ||
                    event.affectsConfiguration("markdown.preview.fontSize") ||
                    event.affectsConfiguration("markdown.preview.lineHeight")
                ) {
                    void this.postMarkdownThemeVariables();
                }
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

    async sendBootstrapMessages(header: AcpUiSessionDocument): Promise<void> {
        if (shouldDeferJsonlHistoryReplay(header)) {
            this.agentLoadInProgress = true;
            this.post({ type: "sessionHistoryLoading", loading: true });
        }
        const initPayload = await this.buildInitPayload(header);
        this.post({ type: "init", ...initPayload });
        void this.postMarkdownThemeVariables();
        this.postSessionConfigSeedOrLoading();
        void this.ensureBridgeConnected();
    }

    private async postMarkdownThemeVariables(): Promise<void> {
        const variables = await resolveMarkdownThemeVariables();
        if (Object.keys(variables).length === 0) {
            return;
        }
        this.post({ type: "vscodeThemeVariables", variables });
    }

    private postSessionConfigSeedOrLoading(): void {
        if (this.agentConfig === undefined) {
            return;
        }
        const seed = readCachedComposerSeed(this.agentConfig.name);
        if (seed.configOptions !== null) {
            this.post({
                type: "sessionConfigOptions",
                options: seed.configOptions,
            });
            return;
        }
        if (seed.modelSelection !== null) {
            this.post({ type: "sessionModels", ...seed.modelSelection });
            return;
        }
        this.post({ type: "sessionConfigOptionsLoading" });
    }

    private async buildInitPayload(
        header: AcpUiSessionDocument,
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
                ? formatPathWithTilde(folder.uri.fsPath, resolveUserHomeDir())
                : undefined;
        const configs = getAcpAgentConfigsFromSettings();
        const availableNames = configs.map((c) => c.name);
        const defaultAgent = this.agentConfig ?? configs[0];
        const workspaceFiles = await workspaceFilesForAutocomplete();
        const cachedSeed =
            defaultAgent !== undefined
                ? readCachedComposerSeed(defaultAgent.name)
                : { configOptions: null, modelSelection: null };
        const vscodeThemeVariables = await resolveMarkdownThemeVariables();
        return {
            sessionId: header.id,
            title: header.title,
            ...(shouldDeferJsonlHistoryReplay(header)
                ? { sessionHistoryLoading: true }
                : {}),
            ...(Object.keys(vscodeThemeVariables).length > 0
                ? { vscodeThemeVariables }
                : {}),
            workspaceLabel,
            homeDir: resolveUserHomeDir(),
            agentVersionLabel,
            acpAgentName: defaultAgent?.name,
            lockSessionAgent: true,
            ...(workspaceFiles !== undefined ? { workspaceFiles } : {}),
            ...(availableNames.length > 0
                ? { availableAcpAgents: availableNames }
                : {}),
            ...(header.history.length > 0 ? { history: header.history } : {}),
            ...(cachedSeed.configOptions !== null
                ? { sessionConfigOptionsSeed: cachedSeed.configOptions }
                : {}),
            ...(cachedSeed.modelSelection !== null
                ? { sessionModels: cachedSeed.modelSelection }
                : {}),
            toolCallVerbosity: readToolCallVerbosityFromSettings(),
            contentWidthRatio: readContentWidthRatioFromSettings(),
        };
    }

    private postToolCallVerbosity(): void {
        this.post({
            type: "toolCallVerbosity",
            verbosity: readToolCallVerbosityFromSettings(),
        });
    }

    private postContentWidthRatio(): void {
        this.post({
            type: "contentWidthRatio",
            ratio: readContentWidthRatioFromSettings(),
        });
    }

    private post(message: ExtensionToWebviewMessage): void {
        void this.options.webview.postMessage(message);
    }

    private async applySessionInfoUpdate(update: {
        title?: string | null;
    }): Promise<void> {
        const title = update.title;
        if (typeof title !== "string" || title.trim().length === 0) {
            return;
        }
        const nextTitle = title.trim();
        const updated = await updateAcpUiSessionTitle(
            this.sessionId,
            nextTitle,
        );
        if (updated) {
            setAcpUiCustomEditorTabTitle(this.documentUri, nextTitle);
            this.options.refreshChatsList?.();
        }
    }

    private disposeBridge(): void {
        this.bridgeConnectGeneration += 1;
        this.bridgeConnectInFlight = undefined;
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
        if (this.bridgeConnectInFlight !== undefined) {
            const inFlight = this.bridgeConnectInFlight;
            const result = await inFlight;
            if (this.bridge !== undefined) {
                return this.bridge;
            }
            if (this.bridgeConnectInFlight === inFlight) {
                return result;
            }
            return this.ensureBridgeConnected();
        }
        const generation = this.bridgeConnectGeneration;
        const connectPromise = this.connectBridge(generation);
        this.bridgeConnectInFlight = connectPromise;
        try {
            const result = await connectPromise;
            if (generation !== this.bridgeConnectGeneration) {
                return undefined;
            }
            return result;
        } finally {
            if (this.bridgeConnectInFlight === connectPromise) {
                this.bridgeConnectInFlight = undefined;
            }
        }
    }

    private async connectBridge(
        generation: number,
    ): Promise<AcpSessionBridge | undefined> {
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
        const host = createDefaultAcpSessionHostRuntime(rpcNdjsonSink);
        const bridge = new AcpSessionBridge(
            config,
            (msg) => this.post(msg),
            host,
            {
                onSessionInfoUpdate: (update) => {
                    void this.applySessionInfoUpdate(update);
                },
                onResumeSession: () => this.beginAgentHistoryLoad(),
            },
        );
        const preferred = this.pendingModelId;
        this.pendingModelId = undefined;
        const pendingConfig = this.pendingConfigOption;
        this.pendingConfigOption = undefined;
        const header = parseSessionFile(this.options.document.getText()).header;
        const runtimeSessionId = header?.runtimeSessionId?.trim();
        try {
            await bridge.connect({
                preferredModelId: preferred,
                ...(runtimeSessionId !== undefined &&
                runtimeSessionId.length > 0
                    ? { runtimeSessionId }
                    : {}),
            });
            if (generation !== this.bridgeConnectGeneration) {
                bridge.dispose();
                return undefined;
            }
            this.bridge = bridge;
            if (pendingConfig !== undefined) {
                try {
                    await bridge.setSessionConfigOption(
                        pendingConfig.configId,
                        pendingConfig.value,
                    );
                } catch (err: unknown) {
                    const msg =
                        err instanceof Error ? err.message : String(err);
                    this.post({
                        type: "error",
                        message: `Config change failed: ${msg}`,
                    });
                }
            }
            const connectedSessionId = bridge.sessionId;
            if (connectedSessionId !== null) {
                void setAcpUiSessionRuntimeSessionId(
                    this.sessionId,
                    connectedSessionId,
                );
            }
            this.options.refreshChatsList?.();
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
        } finally {
            if (this.agentLoadInProgress) {
                this.post({ type: "sessionHistoryLoading", loading: false });
                this.agentLoadInProgress = false;
            }
        }
    }

    private beginAgentHistoryLoad(): void {
        this.agentLoadInProgress = true;
        this.post({ type: "sessionHistoryLoading", loading: true });
    }

    private async handleWebviewMessage(message: unknown): Promise<void> {
        const parsed = tryParseWebviewMessage(message);
        if (parsed === null) {
            return;
        }

        if (parsed.type === "ready") {
            if (this.bootstrapSent) {
                return;
            }
            this.bootstrapSent = true;
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

        if (parsed.type === "openWorkspacePath") {
            const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
            const absolute = resolveWorkspacePath(parsed.path, workspaceRoot);
            const uri = Uri.file(absolute);
            try {
                await openWorkspacePathTarget(uri, parsed.target);
            } catch {
                void window.showErrorMessage(
                    `Could not open ${formatPathWithTilde(
                        parsed.path,
                        resolveUserHomeDir(),
                    )}`,
                );
            }
            return;
        }

        if (parsed.type === "resetSession") {
            this.disposeBridge();
            this.pendingModelId = undefined;
            this.pendingConfigOption = undefined;
            await clearAcpUiSessionRuntimeSessionId(this.sessionId);
            this.post({ type: "sessionReset" });
            this.postSessionConfigSeedOrLoading();
            void this.ensureBridgeConnected();
            return;
        }

        if (parsed.type === "saveHistory") {
            void updateSessionHistory(this.documentUri, parsed.entries);
            return;
        }

        if (parsed.type === "send") {
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
            void (async () => {
                const b = await this.ensureBridgeConnected();
                await b?.cancel();
            })();
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
            const before = getAcpUiSession(this.sessionId);
            const oldUri = before?.uri;
            const renamed = await renameAcpUiSession(this.sessionId, nextTitle);
            if (renamed) {
                const record = getAcpUiSession(this.sessionId);
                if (record !== undefined && oldUri !== undefined) {
                    moveAcpUiCustomEditorUri(oldUri, record.uri);
                    setAcpUiCustomEditorTabTitle(record.uri, nextTitle);
                }
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
                const b = this.bridge ?? (await this.ensureBridgeConnected());
                if (b === undefined) {
                    this.pendingConfigOption = {
                        configId: parsed.configId,
                        value: parsed.value,
                    };
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
            this.pendingConfigOption = undefined;
            await clearAcpUiSessionRuntimeSessionId(this.sessionId);
            const names = getAcpAgentConfigsFromSettings().map((c) => c.name);
            this.post({ type: "sessionReset" });
            this.post({
                type: "acpAgentSelection",
                currentAgentName: config.name,
                availableAgentNames: names,
            });
            this.postSessionConfigSeedOrLoading();
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
