/**
 * Flattens the VS Code Dark Modern color theme into standalone/themes/dark-modern.json.
 * Requires a local VS Code install (used for dev sync only).
 *
 * Usage: npm run sync:standalone-theme
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeColorThemeJson } from "../src/platform/markdownThemeResolver";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "standalone/themes/dark-modern.json");

const vscodeThemeCandidates = [
    "/usr/share/code/resources/app/extensions/theme-defaults/themes/dark_modern.json",
    "/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/theme-defaults/themes/dark_modern.json",
    join(
        process.env.LOCALAPPDATA ?? "",
        "Programs/Microsoft VS Code/resources/app/extensions/theme-defaults/themes/dark_modern.json",
    ),
];

function loadTheme(
    themePath: string,
    visited: Set<string> = new Set(),
): ReturnType<typeof mergeColorThemeJson> {
    const resolved = resolve(themePath);
    if (visited.has(resolved)) {
        return {};
    }
    visited.add(resolved);
    const parsed = JSON.parse(readFileSync(resolved, "utf-8")) as {
        include?: string;
        colors?: Record<string, string>;
        tokenColors?: unknown[];
        semanticTokenColors?: Record<string, string>;
    };
    if (parsed.include === undefined) {
        return parsed;
    }
    const included = loadTheme(
        join(dirname(resolved), parsed.include),
        visited,
    );
    const merged = mergeColorThemeJson(included, parsed);
    if (parsed.semanticTokenColors !== undefined) {
        return {
            ...merged,
            semanticTokenColors: {
                ...(
                    included as { semanticTokenColors?: Record<string, string> }
                ).semanticTokenColors,
                ...parsed.semanticTokenColors,
            },
        };
    }
    return merged;
}

function resolveVscodeThemePath(): string {
    for (const candidate of vscodeThemeCandidates) {
        if (candidate.length > 0 && existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(
        "Could not find VS Code dark_modern.json. Install VS Code or set a valid theme path.",
    );
}

function main(): void {
    let themePath: string;
    try {
        themePath = resolveVscodeThemePath();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
    }

    const theme = loadTheme(themePath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(theme, null, 2)}\n`);
    console.log(`Wrote ${outPath} from ${themePath}`);
}

main();
