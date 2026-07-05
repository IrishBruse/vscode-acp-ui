import type { ReactElement } from "react";
import "./SessionHistoryLoader.css";

/**
 * Spinner shown while ACP `session/load` replays conversation history.
 */
export function SessionHistoryLoader({
    inline = false,
}: {
    inline?: boolean;
}): ReactElement {
    return (
        <div
            className={
                inline
                    ? "session-history-loader session-history-loader--inline"
                    : "session-history-loader"
            }
            role="status"
            aria-live="polite"
            aria-label="Loading conversation history"
        >
            <div className="session-history-loader__spinner" aria-hidden="true" />
            <span>Loading conversation...</span>
        </div>
    );
}
