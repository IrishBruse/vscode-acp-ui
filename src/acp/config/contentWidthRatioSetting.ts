import { workspace } from "vscode";

const settingKey = "ib-acp-ui.contentWidthRatio";
const defaultRatio = 1;
const minRatio = 0.1;
const maxRatio = 1;

/** Clamps a content width ratio to the supported range. */
export function clampContentWidthRatio(value: number): number {
    if (!Number.isFinite(value)) {
        return defaultRatio;
    }
    return Math.min(maxRatio, Math.max(minRatio, value));
}

/** Reads the chat content column width ratio from VS Code settings. */
export function readContentWidthRatioFromSettings(): number {
    const raw = workspace
        .getConfiguration()
        .get<number>(settingKey, defaultRatio);
    return clampContentWidthRatio(raw);
}

export { settingKey as contentWidthRatioSettingKey };
