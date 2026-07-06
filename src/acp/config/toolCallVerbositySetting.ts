import { workspace } from "vscode";
import type { ToolCallVerbosity } from "../../protocol/extensionHostMessages";

const settingKey = "ib-acp-ui.toolCallVerbosity";

/** Reads the ACP UI tool call display mode from VS Code settings. */
export function readToolCallVerbosityFromSettings(): ToolCallVerbosity {
    const raw = workspace.getConfiguration().get<string>(settingKey, "verbose");
    return raw === "compact" ? "compact" : "verbose";
}

export { settingKey as toolCallVerbositySettingKey };
