import { basename } from "node:path";
import { commands, FileType, type Uri, workspace } from "vscode";
import { normalizePathForCompare } from "./resolveWorkspacePath";

export type WorkspacePathOpenTarget = "file" | "auto";

/** Opens or reveals a resolved filesystem path in the workbench. */
export async function openWorkspacePathTarget(
    uri: Uri,
    target: WorkspacePathOpenTarget | undefined,
): Promise<void> {
    const openMode = target ?? "file";

    if (openMode === "auto") {
        let stat;
        try {
            stat = await workspace.fs.stat(uri);
        } catch {
            await commands.executeCommand("vscode.open", uri);
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

async function revealDirectoryInExplorer(uri: Uri): Promise<void> {
    await ensureDirectoryVisibleInWorkspace(uri);
    await commands.executeCommand("workbench.view.explorer");
    await commands.executeCommand("revealInExplorer", uri);
}

async function ensureDirectoryVisibleInWorkspace(uri: Uri): Promise<void> {
    if (workspace.getWorkspaceFolder(uri) !== undefined) {
        return;
    }

    const folders = workspace.workspaceFolders ?? [];
    const normalized = normalizePathForCompare(uri.fsPath);
    if (
        folders.some(
            (folder) =>
                normalizePathForCompare(folder.uri.fsPath) === normalized,
        )
    ) {
        return;
    }

    const added = workspace.updateWorkspaceFolders(folders.length, null, {
        uri,
        name: basename(uri.fsPath),
    });
    if (!added) {
        return;
    }

    await waitForWorkspaceFolder(normalized);
}

function waitForWorkspaceFolder(normalizedPath: string): Promise<void> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            disposable.dispose();
            resolve();
        }, 500);
        const disposable = workspace.onDidChangeWorkspaceFolders((event) => {
            if (
                event.added.some(
                    (folder) =>
                        normalizePathForCompare(folder.uri.fsPath) ===
                        normalizedPath,
                )
            ) {
                clearTimeout(timeout);
                disposable.dispose();
                resolve();
            }
        });
    });
}
