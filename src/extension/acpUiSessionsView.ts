import type * as acp from "@agentclientprotocol/sdk";
import {
    commands,
    type Event,
    EventEmitter,
    type ExtensionContext,
    RelativePattern,
    ThemeIcon,
    type TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    type TreeView,
    window,
    workspace,
} from "vscode";
import { getAcpAgentConfigsFromSettings } from "../acp/config/vscodeSettingsAgents";
import { createDefaultAcpSessionHostRuntime } from "../platform/vscode/defaultHostRuntime";
import { registerCommandIB } from "../utils/vscode";
import {
    deleteAgentSession,
    fetchAgentSessionsForWorkspace,
} from "./acpAgentSessionLister";
import {
    sessionInfoLabel,
    sortSessionInfos,
} from "./acpAgentSessionListFormat";
import {
    getActiveAgentConfig,
    initializeAcpUiActiveAgent,
    setActiveAgentName,
} from "./acpUiActiveAgent";
import {
    disposeAcpUiEditorForSession,
    openOrRevealAcpUiEditor,
    renameAcpUiSessionTitle,
} from "./acpUiPanel";
import { resolveSessionsDirectoryUri } from "./acpUiSessionJsonl";
import {
    ensureLocalSessionForAgentSession,
    findByRuntimeSessionId,
    getActiveAcpUiSessionId,
    listAcpUiSessions,
    listAcpUiSessionsForAgent,
    refreshAcpUiSessionsFromDisk,
    removeAcpUiSession,
    setActiveAcpUiSessionId,
    touchAcpUiSession,
} from "./acpUiSessionsStore";
import { getAcpUiExtensionActivation } from "./extensionServices";

const viewIdAcpUiSessions = "acpUiSessionsView";

const cmdFocusAcpUiSessions = "ib-acp-ui.focusAcpUiSessions";
const cmdRefreshAcpUiSessions = "ib-acp-ui.refreshAcpUiSessions";
const cmdOpenAcpUiSession = "ib-acp-ui.openAcpUiSession";
const cmdDeleteAcpUiSession = "ib-acp-ui.deleteAcpUiSession";
const cmdRenameAcpUiSession = "ib-acp-ui.renameAcpUiSession";
const cmdSelectActiveAgent = "ib-acp-ui.selectActiveAgent";

const iconChat = "comment-discussion";

type AcpUiSessionTreeSource = "agent" | "local";

type AcpUiSessionsTreeNode = AcpUiSessionTreeItem | AcpUiPlaceholderTreeItem;

type FocusedAcpUiSession =
    | {
          source: "agent";
          runtimeSessionId: string;
          agentName: string;
      }
    | {
          source: "local";
          localSessionId: string;
          agentName: string;
      };

class AcpUiPlaceholderTreeItem extends TreeItem {
    constructor(message: string) {
        super(message, TreeItemCollapsibleState.None);
        this.contextValue = "placeholder";
        this.tooltip = message;
    }
}

class AcpUiSessionTreeItem extends TreeItem {
    constructor(
        public readonly source: AcpUiSessionTreeSource,
        label: string,
        isActive: boolean,
        public readonly agentName: string,
        public readonly localSessionId?: string,
        public readonly runtimeSessionId?: string,
    ) {
        super(label, TreeItemCollapsibleState.None);
        this.contextValue = "session";
        this.description = isActive ? "active" : undefined;
        this.tooltip = label;
        this.iconPath = new ThemeIcon(iconChat);
        const openId = source === "local" ? localSessionId : runtimeSessionId;
        this.command = {
            title: "Open Chat",
            command: cmdOpenAcpUiSession,
            arguments: [openId, agentName, source],
        };
    }
}

export class AcpUiSessionsViewProvider
    implements TreeDataProvider<AcpUiSessionsTreeNode>
{
    private changeEvent = new EventEmitter<AcpUiSessionsTreeNode | undefined>();
    private focusedSession: FocusedAcpUiSession | null = null;
    private agentSessions: acp.SessionInfo[] = [];
    private agentListSupported = false;
    private agentListProbeComplete = false;
    private treeView: TreeView<AcpUiSessionsTreeNode> | undefined;

    private readonly extensionContext: ExtensionContext;

    private constructor(extensionContext: ExtensionContext) {
        this.extensionContext = extensionContext;
    }

    public get onDidChangeTreeData(): Event<AcpUiSessionsTreeNode | undefined> {
        return this.changeEvent.event;
    }

    /**
     * Registers the Chats tree view and session commands. Returns a function that refreshes the tree.
     */
    static activate(context: ExtensionContext): () => void {
        initializeAcpUiActiveAgent(context);
        const provider = new AcpUiSessionsViewProvider(context);
        const treeView = window.createTreeView(viewIdAcpUiSessions, {
            treeDataProvider: provider,
        });
        provider.treeView = treeView;
        context.subscriptions.push(treeView);
        context.subscriptions.push(
            treeView.onDidChangeSelection((e) => {
                const picked = e.selection[0];
                if (picked === undefined || !("source" in picked)) {
                    provider.focusedSession = null;
                    return;
                }
                if (picked.source === "local") {
                    if (picked.localSessionId === undefined) {
                        provider.focusedSession = null;
                        return;
                    }
                    provider.focusedSession = {
                        source: "local",
                        localSessionId: picked.localSessionId,
                        agentName: picked.agentName,
                    };
                    return;
                }
                if (picked.runtimeSessionId === undefined) {
                    provider.focusedSession = null;
                    return;
                }
                provider.focusedSession = {
                    source: "agent",
                    runtimeSessionId: picked.runtimeSessionId,
                    agentName: picked.agentName,
                };
            }),
        );
        context.subscriptions.push(
            treeView.onDidChangeVisibility((e) => {
                if (e.visible) {
                    void provider.refreshFromAgent();
                }
            }),
        );

        provider.updateAgentMessage();
        void provider.refreshFromAgent();

        const sessionsDir = resolveSessionsDirectoryUri(context);
        const watcher = workspace.createFileSystemWatcher(
            new RelativePattern(sessionsDir, "**/*.acp"),
        );
        const onDiskChange = (): void => {
            void refreshAcpUiSessionsFromDisk().then(() => provider.refresh());
        };
        watcher.onDidCreate(onDiskChange);
        watcher.onDidDelete(onDiskChange);
        watcher.onDidChange(onDiskChange);
        context.subscriptions.push(watcher);

        registerCommandIB(
            cmdRefreshAcpUiSessions,
            () => void provider.refreshFromAgent(),
            context,
        );
        registerCommandIB(
            cmdSelectActiveAgent,
            () => void provider.selectActiveAgent(),
            context,
        );
        registerCommandIB(
            cmdOpenAcpUiSession,
            (...args: unknown[]) =>
                void provider.openSession(
                    args[0] as string | undefined,
                    args[1] as string | undefined,
                    args[2] as AcpUiSessionTreeSource | undefined,
                ),
            context,
        );
        registerCommandIB(
            cmdDeleteAcpUiSession,
            (...args: unknown[]) =>
                void provider.deleteSession(
                    args[0] as AcpUiSessionsTreeNode | undefined,
                ),
            context,
        );
        registerCommandIB(
            cmdFocusAcpUiSessions,
            () => commands.executeCommand(`${viewIdAcpUiSessions}.focus`),
            context,
        );
        registerCommandIB(
            cmdRenameAcpUiSession,
            (...args: unknown[]) =>
                void provider.renameSession(
                    args[0] as AcpUiSessionsTreeNode | undefined,
                ),
            context,
        );

        return () => provider.refresh();
    }

    refresh(): void {
        this.changeEvent.fire(undefined);
    }

    async refreshFromAgent(): Promise<void> {
        this.agentListProbeComplete = false;
        this.refresh();
        await refreshAcpUiSessionsFromDisk();
        const agent = getActiveAgentConfig();
        if (agent === undefined) {
            this.agentSessions = [];
            this.agentListSupported = false;
            this.agentListProbeComplete = true;
            this.updateAgentMessage();
            this.refresh();
            return;
        }
        const host = createDefaultAcpSessionHostRuntime(
            getAcpUiExtensionActivation().rpcNdjsonSink,
        );
        const cwd = host.getWorkspaceRoot();
        if (cwd === undefined) {
            this.agentSessions = [];
            this.agentListSupported = false;
            this.agentListProbeComplete = true;
            this.updateAgentMessage();
            this.refresh();
            return;
        }
        try {
            const result = await fetchAgentSessionsForWorkspace(agent, cwd);
            this.agentListSupported = result.supported;
            this.agentSessions = result.supported
                ? sortSessionInfos(result.sessions)
                : [];
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            getAcpUiExtensionActivation().outputChannel.appendLine(
                `[ACP UI] session/list failed for "${agent.name}": ${message}`,
            );
            this.agentListSupported = false;
            this.agentSessions = [];
        }
        this.agentListProbeComplete = true;
        this.updateAgentMessage();
        this.refresh();
    }

    getTreeItem(element: AcpUiSessionsTreeNode): TreeItem {
        return element;
    }

    async getChildren(
        element?: AcpUiSessionsTreeNode,
    ): Promise<AcpUiSessionsTreeNode[]> {
        if (element) {
            return [];
        }
        const agent = getActiveAgentConfig();
        if (agent === undefined) {
            return [
                new AcpUiPlaceholderTreeItem(
                    "No ACP agents configured. Add entries to ib-acp-ui.agents in settings.",
                ),
            ];
        }

        if (!this.agentListProbeComplete) {
            return [new AcpUiPlaceholderTreeItem("Loading chats...")];
        }

        const activeLocalId = getActiveAcpUiSessionId();

        if (!this.agentListSupported) {
            const localSessions = listAcpUiSessionsForAgent(agent.name);
            if (localSessions.length === 0) {
                return [
                    new AcpUiPlaceholderTreeItem(
                        "No chats yet. Use + to start a new chat.",
                    ),
                ];
            }
            return localSessions.map(
                (row) =>
                    new AcpUiSessionTreeItem(
                        "local",
                        row.title,
                        row.id === activeLocalId,
                        agent.name,
                        row.id,
                        row.sessionId,
                    ),
            );
        }

        if (this.agentSessions.length === 0) {
            return [
                new AcpUiPlaceholderTreeItem(
                    "No chats yet. Use + to start a new chat.",
                ),
            ];
        }

        return this.agentSessions.map((row) => {
            const local = findByRuntimeSessionId(agent.name, row.sessionId);
            const isActive = local !== undefined && local.id === activeLocalId;
            return new AcpUiSessionTreeItem(
                "agent",
                sessionInfoLabel(row),
                isActive,
                agent.name,
                local?.id,
                row.sessionId,
            );
        });
    }

    getParent(): undefined {
        return undefined;
    }

    private updateAgentMessage(): void {
        const agent = getActiveAgentConfig();
        if (this.treeView === undefined) {
            return;
        }
        this.treeView.message =
            agent !== undefined ? `Agent: ${agent.name}` : undefined;
    }

    private async selectActiveAgent(): Promise<void> {
        const configs = getAcpAgentConfigsFromSettings();
        if (configs.length === 0) {
            void window.showInformationMessage(
                "No ACP agents configured. Add entries to ib-acp-ui.agents in settings.",
            );
            return;
        }
        const current = getActiveAgentConfig();
        const picked = await window.showQuickPick(
            configs.map((config) => ({
                label: config.name,
                picked: config.name === current?.name,
            })),
            {
                placeHolder: "Select active ACP agent",
            },
        );
        if (picked === undefined) {
            return;
        }
        await setActiveAgentName(picked.label);
        this.updateAgentMessage();
        await this.refreshFromAgent();
    }

    private async openSession(
        sessionId?: string,
        agentName?: string,
        source: AcpUiSessionTreeSource = "agent",
    ): Promise<void> {
        if (typeof sessionId !== "string" || sessionId.length === 0) {
            window.showInformationMessage("Choose a chat from the Chats list");
            return;
        }
        const agent = getActiveAgentConfig();
        const resolvedAgentName = agentName ?? agent?.name;
        if (resolvedAgentName === undefined || agent === undefined) {
            window.showErrorMessage(
                "Cannot open chat because no ACP agents are configured.",
            );
            return;
        }

        if (source === "local") {
            const row = listAcpUiSessions().find((s) => s.id === sessionId);
            if (row === undefined) {
                window.showErrorMessage("That chat no longer exists");
                this.refresh();
                return;
            }
            setActiveAcpUiSessionId(row.id);
            this.refresh();
            touchAcpUiSession(row.id);
            await openOrRevealAcpUiEditor(
                this.extensionContext,
                row.id,
                row.title,
                agent,
            );
            return;
        }

        const runtimeSessionId = sessionId;
        const listed = this.agentSessions.find(
            (row) => row.sessionId === runtimeSessionId,
        );
        const title =
            listed !== undefined
                ? sessionInfoLabel(listed)
                : (findByRuntimeSessionId(resolvedAgentName, runtimeSessionId)
                      ?.title ?? "Chat");

        const local = await ensureLocalSessionForAgentSession({
            agentName: resolvedAgentName,
            runtimeSessionId,
            title,
        });
        setActiveAcpUiSessionId(local.id);
        this.refresh();
        touchAcpUiSession(local.id);
        await openOrRevealAcpUiEditor(
            this.extensionContext,
            local.id,
            local.title,
            agent,
        );
    }

    private async notifyAgentSessionDelete(
        agent: NonNullable<ReturnType<typeof getActiveAgentConfig>>,
        runtimeSessionId: string,
    ): Promise<void> {
        try {
            await deleteAgentSession(agent, runtimeSessionId);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            getAcpUiExtensionActivation().outputChannel.appendLine(
                `[ACP UI] session/delete failed for "${runtimeSessionId}": ${message}`,
            );
        }
    }

    private async deleteSession(
        item: AcpUiSessionsTreeNode | undefined,
    ): Promise<void> {
        const resolved =
            item !== undefined && "source" in item ? item : undefined;
        const focus = this.focusedSession;
        const agentName =
            resolved?.agentName ??
            focus?.agentName ??
            getActiveAgentConfig()?.name;
        if (agentName === undefined) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }

        if (resolved?.source === "local" || focus?.source === "local") {
            const localSessionId =
                resolved?.source === "local"
                    ? resolved.localSessionId
                    : focus?.source === "local"
                      ? focus.localSessionId
                      : undefined;
            if (
                typeof localSessionId !== "string" ||
                localSessionId.length === 0
            ) {
                window.showErrorMessage("Select a chat in the Chats list");
                return;
            }
            const local = listAcpUiSessions().find(
                (row) => row.id === localSessionId,
            );
            if (local === undefined) {
                window.showErrorMessage("That chat no longer exists");
                this.refresh();
                return;
            }
            const answer = await window.showWarningMessage(
                `Delete chat "${local.title}"? This cannot be undone.`,
                { modal: true },
                "Delete",
            );
            if (answer !== "Delete") {
                return;
            }
            const agent = getActiveAgentConfig();
            if (
                agent !== undefined &&
                local.sessionId !== undefined &&
                local.sessionId.length > 0
            ) {
                await this.notifyAgentSessionDelete(agent, local.sessionId);
            }
            await disposeAcpUiEditorForSession(local.id);
            await removeAcpUiSession(local.id);
            if (this.agentListSupported) {
                await this.refreshFromAgent();
            } else {
                this.refresh();
            }
            return;
        }

        const runtimeSessionId =
            resolved?.runtimeSessionId ??
            (focus?.source === "agent" ? focus.runtimeSessionId : undefined);
        if (
            typeof runtimeSessionId !== "string" ||
            runtimeSessionId.length === 0
        ) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }

        const listed = this.agentSessions.find(
            (row) => row.sessionId === runtimeSessionId,
        );
        const local = findByRuntimeSessionId(agentName, runtimeSessionId);
        const labelText =
            listed !== undefined
                ? sessionInfoLabel(listed)
                : (local?.title ?? "chat");
        const answer = await window.showWarningMessage(
            `Delete chat "${labelText}"? This cannot be undone.`,
            { modal: true },
            "Delete",
        );
        if (answer !== "Delete") {
            return;
        }

        const agent = getActiveAgentConfig();
        if (agent !== undefined) {
            await this.notifyAgentSessionDelete(agent, runtimeSessionId);
        }

        if (local !== undefined) {
            await disposeAcpUiEditorForSession(local.id);
            await removeAcpUiSession(local.id);
        }
        await this.refreshFromAgent();
    }

    private async renameSession(
        item: AcpUiSessionsTreeNode | undefined,
    ): Promise<void> {
        const resolved =
            item !== undefined && "source" in item ? item : undefined;
        const focus = this.focusedSession;
        const agentName =
            resolved?.agentName ??
            focus?.agentName ??
            getActiveAgentConfig()?.name;
        if (agentName === undefined) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }

        let local =
            resolved?.source === "local" &&
            resolved.localSessionId !== undefined
                ? listAcpUiSessions().find(
                      (row) => row.id === resolved.localSessionId,
                  )
                : focus?.source === "local"
                  ? listAcpUiSessions().find(
                        (row) => row.id === focus.localSessionId,
                    )
                  : undefined;
        if (local === undefined) {
            const runtimeSessionId =
                resolved?.runtimeSessionId ??
                (focus?.source === "agent"
                    ? focus.runtimeSessionId
                    : undefined);
            if (
                typeof runtimeSessionId !== "string" ||
                runtimeSessionId.length === 0
            ) {
                window.showErrorMessage("Select a chat in the Chats list");
                return;
            }
            local = findByRuntimeSessionId(agentName, runtimeSessionId);
        }
        if (local === undefined) {
            window.showErrorMessage(
                "Open this chat before renaming it locally.",
            );
            return;
        }
        const nextTitle = await window.showInputBox({
            title: "Rename chat",
            prompt: "Enter a new name for this chat",
            value: local.title,
            validateInput: (value) =>
                value.trim().length === 0 ? "Name cannot be empty" : undefined,
        });
        if (nextTitle === undefined) {
            return;
        }
        if (!(await renameAcpUiSessionTitle(local.id, nextTitle))) {
            window.showErrorMessage("Rename failed");
            return;
        }
        this.refresh();
    }
}
