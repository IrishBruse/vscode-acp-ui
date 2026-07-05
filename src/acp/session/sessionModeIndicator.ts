import type { AcpUiSessionConfigOption } from "./sessionConfigOptions";

export type SessionModeIndicatorTone = "ask" | "plan" | "debug";

export type SessionModeIndicatorSpec =
    | {
          visible: true;
          label: string;
          tone: SessionModeIndicatorTone;
      }
    | {
          visible: false;
      };

const DEFAULT_MODE_VALUES = new Set(["agent", "code", "normal", ""]);

function normalizedModeValue(modeValue: string): string {
    return modeValue.trim().toLowerCase();
}

/**
 * Maps an ACP session mode wire value to a colored composer label.
 * Default/agent modes render with no visible text.
 */
export function resolveSessionModeIndicator(
    modeValue: string,
    choiceName?: string,
): SessionModeIndicatorSpec {
    const normalized = normalizedModeValue(modeValue);
    if (DEFAULT_MODE_VALUES.has(normalized)) {
        return { visible: false };
    }
    if (normalized === "ask") {
        return { visible: true, label: choiceName ?? "Ask", tone: "ask" };
    }
    if (normalized === "plan") {
        return { visible: true, label: choiceName ?? "Plan", tone: "plan" };
    }
    if (normalized === "debug") {
        return { visible: true, label: choiceName ?? "Debug", tone: "debug" };
    }
    return { visible: false };
}

export function sessionModeIndicatorFromOption(
    option: Extract<AcpUiSessionConfigOption, { type: "select" }> | undefined,
): SessionModeIndicatorSpec {
    if (option === undefined) {
        return { visible: false };
    }
    const choice = option.options.find(
        (row) => row.value === option.currentValue,
    );
    return resolveSessionModeIndicator(option.currentValue, choice?.name);
}

export function isSessionModeConfigOption(
    option: AcpUiSessionConfigOption,
): boolean {
    return option.category === "mode" || option.configId === "mode";
}
