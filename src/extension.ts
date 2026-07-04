import type { ExtensionContext } from "vscode";
import { registerAcpUiCustomEditorProvider } from "./extension/acpUiCustomEditorProvider";
import { registerAcpUiPanel } from "./extension/acpUiPanel";
import { initializeAcpUiSessionsStore } from "./extension/acpUiSessionsStore";
import { AcpUiSessionsViewProvider } from "./extension/acpUiSessionsView";
import { activateAcpUiExtension } from "./extension/activateAcpUiExtension";
import { setAcpUiExtensionActivation } from "./extension/extensionServices";

/** Composition root: shared ACP services, ACP UI custom editor, and commands. */
export async function activate(context: ExtensionContext): Promise<void> {
    const activation = activateAcpUiExtension(context);
    setAcpUiExtensionActivation(activation);
    await initializeAcpUiSessionsStore(context, {
        log: (message) => activation.outputChannel.appendLine(message),
    });
    const refreshChatsList = AcpUiSessionsViewProvider.activate(context);
    registerAcpUiCustomEditorProvider(context);
    registerAcpUiPanel(context, refreshChatsList);
}

export function deactivate(): void {}
