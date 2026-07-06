import type { ReactElement } from "react";
import "./ToolCallCompactBlock.css";
import type { TraceToolItem } from "../chatReducer";
import {
    compactToolDetailLine,
    compactToolGroupSummary,
    compactToolShowsDiffStats,
    diffLineStats,
    basenameFromPath,
} from "../toolCallCompactText";

function CompactEditLine({ item }: { item: TraceToolItem }): ReactElement {
    const subtitle = item.subtitle?.trim() ?? "";
    const path =
        subtitle.length > 0
            ? subtitle
            : (item.content?.split("\n")[0]?.trim() ?? item.title);
    const base = basenameFromPath(path);
    const { added, removed } = diffLineStats(item.diffRows);
    return (
        <span className="tool-call-compact-edit">
            <span>Edited {base}</span>
            {added > 0 ? (
                <span className="tool-call-compact-stat tool-call-compact-stat--added">
                    {" "}
                    +{added}
                </span>
            ) : null}
            {removed > 0 ? (
                <span className="tool-call-compact-stat tool-call-compact-stat--removed">
                    {" "}
                    -{removed}
                </span>
            ) : null}
        </span>
    );
}

function CompactDetailLine({ item }: { item: TraceToolItem }): ReactElement {
    if (compactToolShowsDiffStats(item)) {
        return <CompactEditLine item={item} />;
    }
    return <span>{compactToolDetailLine(item)}</span>;
}

/**
 * Compact tool-call presentation: one summary line, optional per-tool detail lines.
 */
export function ToolCallCompactBlock({
    items,
    className,
}: {
    items: TraceToolItem[];
    className?: string;
}): ReactElement {
    const single = items.length === 1;
    const summaryText = compactToolGroupSummary(items);
    const inProgress = items.some(
        (item) => item.status === "pending" || item.status === "in_progress",
    );

    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "tool-call-compact"
                    : `tool-call-compact ${className}`
            }
            data-status={inProgress ? "in_progress" : "completed"}
            role="status"
            aria-label="Tool use"
        >
            {single && compactToolShowsDiffStats(items[0]!) ? (
                <div className="tool-call-compact-summary">
                    <CompactEditLine item={items[0]!} />
                </div>
            ) : (
                <div className="tool-call-compact-summary">{summaryText}</div>
            )}
            {!single ? (
                <ul className="tool-call-compact-details" aria-label="Tool details">
                    {items.map((item) => (
                        <li
                            key={item.toolCallId}
                            className="tool-call-compact-detail"
                            data-tool-id={item.toolCallId}
                            data-status={item.status}
                        >
                            <CompactDetailLine item={item} />
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
