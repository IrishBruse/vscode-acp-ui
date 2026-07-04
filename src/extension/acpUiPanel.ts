import {
    commands,
    type ExtensionContext,
    TabInputText,
    ViewColumn,
    window,
} from "vscode";
import type { AcpAgentConfig } from "../acp/config/vscodeSettingsAgents";
import { registerCommandIB } from "../utils/vscode";
import {
    getDefaultAcpAgentConfig,
    pickAcpAgentConfig,
} from "./acpUiAgentPicker";
import {
    acpUiCustomEditorViewType,
    setAcpUiCustomEditorRefreshHandler,
    setAcpUiCustomEditorTabTitle,
} from "./acpUiCustomEditorProvider";
import {
    addAcpUiSession,
    getAcpUiSession,
    listAcpUiSessions,
    renameAcpUiSession,
    setActiveAcpUiSessionId,
    touchAcpUiSession,
} from "./acpUiSessionsStore";

let refreshChatsListHandler: (() => void) | undefined;

export async function renameAcpUiSessionTitle(
    sessionId: string,
    nextTitle: string,
): Promise<boolean> {
    const renamed = await renameAcpUiSession(sessionId, nextTitle);
    if (!renamed) {
        return false;
    }
    const record = getAcpUiSession(sessionId);
    if (record !== undefined) {
        setAcpUiCustomEditorTabTitle(record.uri, nextTitle);
    }
    refreshChatsListHandler?.();
    return true;
}

/**
 * Opens or reveals the custom editor for a session JSONL file.
 */
export async function openOrRevealAcpUiEditor(
    _context: ExtensionContext,
    sessionId: string,
    _title: string,
    _agentConfig?: AcpAgentConfig,
): Promise<void> {
    const record = getAcpUiSession(sessionId);
    if (record === undefined) {
        window.showErrorMessage("That chat no longer exists.");
        refreshChatsListHandler?.();
        return;
    }
    touchAcpUiSession(sessionId);
    refreshChatsListHandler?.();
    await commands.executeCommand(
        "vscode.openWith",
        record.uri,
        acpUiCustomEditorViewType,
        ViewColumn.Active,
    );
}

/**
 * Closes editor tabs for a session file if open.
 */
export async function disposeAcpUiEditorForSession(
    sessionId: string,
): Promise<void> {
    const record = getAcpUiSession(sessionId);
    if (record === undefined) {
        return;
    }
    const target = record.uri.toString();
    for (const group of window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (
                input instanceof TabInputText &&
                input.uri.toString() === target
            ) {
                await window.tabGroups.close(tab);
            }
        }
    }
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
    setAcpUiCustomEditorRefreshHandler(refreshChatsList);
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
    await openNewAcpUi(context, refreshChatsList, agentConfig);
}

async function openNewAcpUiWithAgentPicker(
    context: ExtensionContext,
    refreshChatsList: () => void,
): Promise<void> {
    const agentConfig = await pickAcpAgentConfig();
    if (agentConfig === undefined) {
        return;
    }
    await openNewAcpUi(context, refreshChatsList, agentConfig);
}

async function openNewAcpUi(
    context: ExtensionContext,
    refreshChatsList: () => void,
    agentConfig: AcpAgentConfig,
): Promise<void> {
    const nextIndex = listAcpUiSessions().length + 1;
    const created = await addAcpUiSession(`Chat ${nextIndex}`, {
        agentName: agentConfig.name,
    });
    setActiveAcpUiSessionId(created.id);
    await openOrRevealAcpUiEditor(
        context,
        created.id,
        created.title,
        agentConfig,
    );
    refreshChatsList();
}
