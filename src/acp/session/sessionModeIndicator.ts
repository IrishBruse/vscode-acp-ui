import type { AcpUiSessionConfigOption } from "./sessionConfigOptions";

export type SessionModeIndicatorTone = "ask" | "plan";

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
    if (normalized === "plan" || normalized === "architect") {
        return { visible: true, label: choiceName ?? "Plan", tone: "plan" };
    }
    return { visible: false };
}

/**
 * Composer placeholder copy for the active session mode.
 */
export function resolveComposerPlaceholder(modeValue: string): string {
    const normalized = normalizedModeValue(modeValue);
    if (normalized === "ask") {
        return "Ask the agent a question";
    }
    if (normalized === "plan" || normalized === "architect") {
        return "Describe what you want the agent to plan";
    }
    return "Describe a task for the agent to do";
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
