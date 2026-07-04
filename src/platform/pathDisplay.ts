import { homedir } from "node:os";

/**
 * Replaces the user home directory prefix with `~` for compact UI labels.
 */
export function formatPathWithTilde(
    path: string,
    home: string = homedir(),
): string {
    if (path.length === 0 || home.length === 0) {
        return path;
    }
    const normalizedPath = path.replace(/\\/g, "/");
    const normalizedHome = home.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalizedPath === normalizedHome) {
        return "~";
    }
    const prefix = `${normalizedHome}/`;
    if (normalizedPath.startsWith(prefix)) {
        return `~/${normalizedPath.slice(prefix.length)}`;
    }
    return path;
}
