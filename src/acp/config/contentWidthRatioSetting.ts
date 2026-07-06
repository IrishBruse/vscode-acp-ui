import { workspace } from "vscode";

const settingKey = "ib-acp-ui.contentWidthPercent";
const defaultPercent = 100;
const minPercent = 10;
const maxPercent = 100;

/** Clamps a content width percentage to the supported range. */
export function clampContentWidthPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return defaultPercent;
    }
    return Math.min(maxPercent, Math.max(minPercent, value));
}

/** Reads the chat content column width ratio (0.1 to 1) from VS Code settings. */
export function readContentWidthRatioFromSettings(): number {
    const raw = workspace
        .getConfiguration()
        .get<number>(settingKey, defaultPercent);
    return clampContentWidthPercent(raw) / 100;
}

export { settingKey as contentWidthPercentSettingKey };
