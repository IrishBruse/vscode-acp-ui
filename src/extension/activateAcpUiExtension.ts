import {
    Disposable,
    type ExtensionContext,
    type OutputChannel,
    window,
} from "vscode";
import {
    buildAcpClientInfoFromPackage,
    configureAcpClientInfo,
} from "../acp/infrastructure/acpAgentProcess";
import { VscodeAcpRpcNdjsonSink } from "../platform/vscode/vscodeRpcNdjsonSink";
import { registerCommandIB } from "../utils/vscode";

export type AcpUiExtensionActivation = {
    /** Shared between stdio taps and optional UI hosts that embed a bridge. */
    rpcNdjsonSink: VscodeAcpRpcNdjsonSink;
    outputChannel: OutputChannel;
};

/**
 * Registers the ACP RPC output channel and related commands.
 */
export function activateAcpUiExtension(
    context: ExtensionContext,
): AcpUiExtensionActivation {
    configureAcpClientInfo(
        buildAcpClientInfoFromPackage(
            context.extension.packageJSON as {
                name?: string;
                version?: string;
                displayName?: string;
            },
        ),
    );
    const outputChannel = window.createOutputChannel("ACP UI RPC", "jsonl");
    const rpcNdjsonSink = new VscodeAcpRpcNdjsonSink(outputChannel, null);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(new Disposable(() => rpcNdjsonSink.dispose()));
    registerCommandIB(
        "ib-acp-ui.showAcpRpcLog",
        () => {
            outputChannel.show(true);
        },
        context,
    );
    return { rpcNdjsonSink, outputChannel };
}
