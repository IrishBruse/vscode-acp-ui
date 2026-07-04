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
    window,
    workspace,
} from "vscode";
import {
    getAcpAgentConfigByName,
    getAcpAgentConfigsFromSettings,
} from "../acp/config/vscodeSettingsAgents";
import { registerCommandIB } from "../utils/vscode";
import {
    disposeAcpUiEditorForSession,
    openOrRevealAcpUiEditor,
    renameAcpUiSessionTitle,
} from "./acpUiPanel";
import { resolveSessionsDirectoryUri } from "./acpUiSessionJsonl";
import {
    type AcpUiSessionRecord,
    getActiveAcpUiSessionId,
    listAcpUiSessions,
    refreshAcpUiSessionsFromDisk,
    removeAcpUiSession,
    setActiveAcpUiSessionId,
    touchAcpUiSession,
} from "./acpUiSessionsStore";

const viewIdAcpUiSessions = "acpUiSessionsView";

const cmdFocusAcpUiSessions = "ib-acp-ui.focusAcpUiSessions";
const cmdRefreshAcpUiSessions = "ib-acp-ui.refreshAcpUiSessions";
const cmdOpenAcpUiSession = "ib-acp-ui.openAcpUiSession";
const cmdDeleteAcpUiSession = "ib-acp-ui.deleteAcpUiSession";
const cmdRenameAcpUiSession = "ib-acp-ui.renameAcpUiSession";

const iconChat = "comment-discussion";

type AcpUiSessionsTreeNode = AcpUiSessionTreeItem | AcpUiPlaceholderTreeItem;

class AcpUiPlaceholderTreeItem extends TreeItem {
    constructor() {
        super("No chats yet", TreeItemCollapsibleState.None);
        this.contextValue = "placeholder";
        this.tooltip =
            "Use New ACP UI in Editor on the Chats view title to create a chat";
    }
}

class AcpUiSessionTreeItem extends TreeItem {
    constructor(
        public readonly sessionId: string,
        label: string,
        isActive: boolean,
    ) {
        super(label, TreeItemCollapsibleState.None);
        this.contextValue = "session";
        this.description = isActive ? "active" : undefined;
        this.tooltip = label;
        this.iconPath = new ThemeIcon(iconChat);
        this.command = {
            title: "Open Chat",
            command: cmdOpenAcpUiSession,
            arguments: [sessionId],
        };
    }
}

export class AcpUiSessionsViewProvider
    implements TreeDataProvider<AcpUiSessionsTreeNode>
{
    private changeEvent = new EventEmitter<AcpUiSessionsTreeNode | undefined>();
    private focusedSessionId: string | null = null;

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
        const provider = new AcpUiSessionsViewProvider(context);
        const treeView = window.createTreeView(viewIdAcpUiSessions, {
            treeDataProvider: provider,
        });
        context.subscriptions.push(treeView);
        context.subscriptions.push(
            treeView.onDidChangeSelection((e) => {
                const picked = e.selection[0];
                provider.focusedSessionId =
                    picked !== undefined && "sessionId" in picked
                        ? picked.sessionId
                        : null;
            }),
        );

        const sessionsDir = resolveSessionsDirectoryUri(context);
        const watcher = workspace.createFileSystemWatcher(
            new RelativePattern(sessionsDir, "*.acp"),
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
            () => {
                void refreshAcpUiSessionsFromDisk().then(() =>
                    provider.refresh(),
                );
            },
            context,
        );
        registerCommandIB(
            cmdOpenAcpUiSession,
            (...args: unknown[]) =>
                void provider.openSession(args[0] as string | undefined),
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

    getTreeItem(element: AcpUiSessionsTreeNode): TreeItem {
        return element;
    }

    async getChildren(
        element?: AcpUiSessionsTreeNode,
    ): Promise<AcpUiSessionsTreeNode[]> {
        if (element) {
            return [];
        }
        const rows = listAcpUiSessions();
        if (rows.length === 0) {
            return [new AcpUiPlaceholderTreeItem()];
        }
        const active = getActiveAcpUiSessionId();
        return rows.map((row) => this.toTreeItem(row, active));
    }

    getParent(): undefined {
        return undefined;
    }

    private toTreeItem(
        row: AcpUiSessionRecord,
        activeId: string | null,
    ): AcpUiSessionTreeItem {
        return new AcpUiSessionTreeItem(row.id, row.title, row.id === activeId);
    }

    private async openSession(sessionId?: string): Promise<void> {
        if (typeof sessionId !== "string" || sessionId.length === 0) {
            window.showInformationMessage("Choose a chat from the Chats list");
            return;
        }
        const row = listAcpUiSessions().find((s) => s.id === sessionId);
        if (!row) {
            window.showErrorMessage("That chat no longer exists");
            this.refresh();
            return;
        }
        setActiveAcpUiSessionId(sessionId);
        this.refresh();
        const agentConfig =
            row.agentName !== undefined
                ? getAcpAgentConfigByName(row.agentName)
                : getAcpAgentConfigsFromSettings()[0];
        if (agentConfig === undefined) {
            window.showErrorMessage(
                row.agentName !== undefined
                    ? `Cannot open chat "${row.title}" because agent "${row.agentName}" is no longer configured. Re-add that agent or delete this chat.`
                    : `Cannot open chat "${row.title}" because no ACP agents are configured.`,
            );
            return;
        }
        touchAcpUiSession(sessionId);
        await openOrRevealAcpUiEditor(
            this.extensionContext,
            sessionId,
            row.title,
            agentConfig,
        );
    }

    private async deleteSession(
        item: AcpUiSessionsTreeNode | undefined,
    ): Promise<void> {
        if (!item || !("sessionId" in item)) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }
        const row = listAcpUiSessions().find((s) => s.id === item.sessionId);
        const labelText = row?.title ?? "chat";
        const answer = await window.showWarningMessage(
            `Delete chat "${labelText}"? This cannot be undone.`,
            { modal: true },
            "Delete",
        );
        if (answer !== "Delete") {
            return;
        }
        await disposeAcpUiEditorForSession(item.sessionId);
        await removeAcpUiSession(item.sessionId);
        this.refresh();
    }

    private async renameSession(
        item: AcpUiSessionsTreeNode | undefined,
    ): Promise<void> {
        const resolvedSessionId =
            item !== undefined && "sessionId" in item
                ? item.sessionId
                : (this.focusedSessionId ?? getActiveAcpUiSessionId());
        if (
            typeof resolvedSessionId !== "string" ||
            resolvedSessionId.length === 0
        ) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }
        const row = listAcpUiSessions().find((s) => s.id === resolvedSessionId);
        if (!row) {
            window.showErrorMessage("That chat no longer exists");
            this.refresh();
            return;
        }
        const nextTitle = await window.showInputBox({
            title: "Rename chat",
            prompt: "Enter a new name for this chat",
            value: row.title,
            validateInput: (value) =>
                value.trim().length === 0 ? "Name cannot be empty" : undefined,
        });
        if (nextTitle === undefined) {
            return;
        }
        if (!(await renameAcpUiSessionTitle(resolvedSessionId, nextTitle))) {
            window.showErrorMessage("Rename failed");
            return;
        }
        this.refresh();
    }
}
