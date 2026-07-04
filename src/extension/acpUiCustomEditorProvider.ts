import {
    type CancellationToken,
    type CustomTextEditorProvider,
    type ExtensionContext,
    type TextDocument,
    ThemeIcon,
    type Uri,
    type WebviewPanel,
    window,
} from "vscode";
import { AcpUiSessionController } from "./acpUiSessionController";
import { parseSessionFile } from "./acpUiSessionJsonl";
import { getAcpUiWebviewHtml } from "./acpUiWebviewShell";

export const acpUiCustomEditorViewType = "ibAcpUi.session";

const acpUiPanelTabIcon = new ThemeIcon("comment-discussion");

const controllersByDocumentUri = new Map<string, AcpUiSessionController>();
const panelsByDocumentUri = new Map<string, WebviewPanel>();

let refreshChatsListHandler: (() => void) | undefined;

export function setAcpUiCustomEditorTabTitle(uri: Uri, title: string): void {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
        return;
    }
    const panel = panelsByDocumentUri.get(uri.toString());
    if (panel !== undefined) {
        panel.title = trimmed;
    }
}

export function setAcpUiCustomEditorRefreshHandler(
    refreshChatsList: () => void,
): void {
    refreshChatsListHandler = refreshChatsList;
}

/**
 * Custom editor for `.acp` session files: hosts the ACP UI webview and persists events.
 */
export class AcpUiCustomEditorProvider implements CustomTextEditorProvider {
    constructor(private readonly context: ExtensionContext) {}

    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        const parsed = parseSessionFile(document.getText());
        if (parsed.header === null) {
            webviewPanel.webview.html =
                "<!DOCTYPE html><html><body><p>Invalid ACP UI session file: missing header.</p></body></html>";
            return;
        }

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewPanel.webview.html = getAcpUiWebviewHtml(
            this.context.extensionUri,
            webviewPanel.webview,
        );
        webviewPanel.title = parsed.header.title;
        webviewPanel.iconPath = acpUiPanelTabIcon;

        const controller = new AcpUiSessionController({
            context: this.context,
            document,
            webview: webviewPanel.webview,
            refreshChatsList: refreshChatsListHandler,
        });
        const uriKey = document.uri.toString();
        controllersByDocumentUri.set(uriKey, controller);
        panelsByDocumentUri.set(uriKey, webviewPanel);
        controller.activate();

        webviewPanel.onDidDispose(() => {
            controllersByDocumentUri.delete(uriKey);
            panelsByDocumentUri.delete(uriKey);
            controller.dispose();
        });
    }
}

export function registerAcpUiCustomEditorProvider(
    context: ExtensionContext,
): void {
    context.subscriptions.push(
        window.registerCustomEditorProvider(
            acpUiCustomEditorViewType,
            new AcpUiCustomEditorProvider(context),
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            },
        ),
    );
}
