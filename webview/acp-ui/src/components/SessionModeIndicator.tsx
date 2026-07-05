import type { ReactElement } from "react";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import { sessionModeIndicatorFromOption } from "../../../../src/acp/session/sessionModeIndicator";
import "./SessionModeIndicator.css";

export type SessionModeIndicatorProps = {
    modeOption: Extract<AcpUiSessionConfigOption, { type: "select" }> | undefined;
};

/**
 * Colored session mode label (hidden for default/agent mode).
 */
export function SessionModeIndicator({
    modeOption,
}: SessionModeIndicatorProps): ReactElement | null {
    const spec = sessionModeIndicatorFromOption(modeOption);
    if (!spec.visible) {
        return null;
    }
    return (
        <span
            className={`composer-mode-indicator composer-mode-indicator--${spec.tone}`}
            aria-label={`Session mode: ${spec.label}`}
            title={`Session mode: ${spec.label}`}
        >
            {spec.label}
        </span>
    );
}
