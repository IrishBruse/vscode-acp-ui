import { workspace } from "vscode";
import type { ToolCallVerbosity } from "../../protocol/extensionHostMessages";

const settingKey = "ib-acp-ui.toolCallVerbosity";

const validVerbosityLevels: ReadonlySet<ToolCallVerbosity> = new Set([
    "minimal",
    "compact",
    "verbose",
]);

/** Reads the ACP UI tool call display mode from VS Code settings. */
export function readToolCallVerbosityFromSettings(): ToolCallVerbosity {
    const raw = workspace.getConfiguration().get<string>(settingKey, "verbose");
    if (validVerbosityLevels.has(raw as ToolCallVerbosity)) {
        return raw as ToolCallVerbosity;
    }
    return "verbose";
}

export { settingKey as toolCallVerbositySettingKey };
