import { isAbsolute, join } from "node:path";
import { resolveUserHomeDir } from "./resolveUserHomeDir";

/** Expands a leading `~` using `HOME` (then `homedir()`). */
export function expandTildeInPath(path: string): string {
    const trimmed = path.trim();
    if (trimmed === "~") {
        return resolveUserHomeDir();
    }
    if (trimmed.startsWith("~/")) {
        return join(resolveUserHomeDir(), trimmed.slice(2));
    }
    if (trimmed.startsWith("~\\")) {
        return join(resolveUserHomeDir(), trimmed.slice(2));
    }
    return trimmed;
}

/** Normalizes paths for stable workspace-root comparisons. */
export function normalizePathForCompare(fsPath: string): string {
    return fsPath.replace(/\\/g, "/").replace(/\/$/, "");
}

/** Resolves a workspace-relative or absolute tool path to an absolute filesystem path. */
export function resolveWorkspacePath(
    path: string,
    workspaceRoot: string | undefined,
): string {
    const expanded = expandTildeInPath(path);
    if (isAbsolute(expanded)) {
        return expanded;
    }
    if (workspaceRoot !== undefined && workspaceRoot.length > 0) {
        return join(workspaceRoot, expanded);
    }
    return expanded;
}
