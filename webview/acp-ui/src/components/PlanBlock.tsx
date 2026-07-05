import type { ReactElement } from "react";
import "./PlanBlock.css";
import type { PlanEntry } from "../../../../src/protocol/extensionHostMessages";

/**
 * Renders an ACP agent plan as a titled list of status rows.
 */
export function PlanBlock({
    entries,
    className,
}: {
    entries: PlanEntry[];
    className?: string;
}): ReactElement {
    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "agent-plan"
                    : `agent-plan ${className}`
            }
            aria-label="Agent plan"
        >
            <div className="agent-plan-title">Plan</div>
            {entries.map((e, i) => (
                <div
                    key={i}
                    className="agent-plan-row"
                    title={
                        e.priority !== undefined
                            ? `priority: ${e.priority}`
                            : undefined
                    }
                >
                    <span className="agent-plan-status">{e.status}</span>
                    <span className="agent-plan-content">{e.content}</span>
                </div>
            ))}
        </div>
    );
}
