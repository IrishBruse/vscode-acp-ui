import { commands, type FileStat, FileType, type Uri, workspace } from "vscode";

export type WorkspacePathOpenTarget = "file" | "auto";

/** Opens or reveals a resolved filesystem path in the workbench. */
export async function openWorkspacePathTarget(
    uri: Uri,
    target: WorkspacePathOpenTarget | undefined,
): Promise<void> {
    const openMode = target ?? "file";

    if (openMode === "auto") {
        let stat: FileStat;
        try {
            stat = await workspace.fs.stat(uri);
        } catch {
            await openOutsideWorkspace(uri);
            return;
        }

        if (!isInWorkspace(uri)) {
            await openOutsideWorkspace(uri);
            return;
        }

        if (stat.type === FileType.Directory) {
            await revealDirectoryInExplorer(uri);
            return;
        }

        await commands.executeCommand("vscode.open", uri);
        return;
    }

    await commands.executeCommand("vscode.open", uri);
}

function isInWorkspace(uri: Uri): boolean {
    return workspace.getWorkspaceFolder(uri) !== undefined;
}

async function openOutsideWorkspace(uri: Uri): Promise<void> {
    await commands.executeCommand("revealFileInOS", uri);
}

async function revealDirectoryInExplorer(uri: Uri): Promise<void> {
    await commands.executeCommand("workbench.view.explorer");
    await commands.executeCommand("revealInExplorer", uri);
}
