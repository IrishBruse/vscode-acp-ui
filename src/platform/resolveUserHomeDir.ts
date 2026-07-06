import { homedir } from "node:os";

/** User home directory for path display (`HOME` on Unix, then `homedir()`). */
export function resolveUserHomeDir(): string {
    const fromEnv = process.env.HOME?.trim();
    if (fromEnv !== undefined && fromEnv.length > 0) {
        return fromEnv;
    }
    return homedir();
}
