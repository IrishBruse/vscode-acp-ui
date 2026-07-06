import type { ReactElement } from "react";
import "./ToolCallCompactBlock.css";
import type { TraceToolItem } from "../chatReducer";
import {
    type CompactToolDetailParts,
    compactToolDetailParts,
    compactToolGroupSummaryParts,
    compactToolShowsDiffStats,
    diffLineStats,
} from "../toolCallCompactText";

function CompactDetailText({ parts }: { parts: CompactToolDetailParts }): ReactElement {
    const segment = parts.pathSegment;
    if (segment === undefined) {
        return (
            <span className="tool-call-compact-detail-text">{parts.detail}</span>
        );
    }
    return (
        <span className="tool-call-compact-detail-text">
            {segment.prefix ?? null}
            <span className="tool-call-compact-path" title={segment.title}>
                {segment.label}
            </span>
            {segment.suffix ?? null}
        </span>
    );
}

function CompactVerbDetail({
    parts,
}: {
    parts: CompactToolDetailParts;
}): ReactElement {
    return (
        <>
            <span className="tool-call-compact-verb">{parts.verb}</span>
            {parts.detail.length > 0 ? (
                <>
                    {" "}
                    <CompactDetailText parts={parts} />
                </>
            ) : null}
        </>
    );
}

function CompactEditLine({ item }: { item: TraceToolItem }): ReactElement {
    const parts = compactToolDetailParts(item);
    const { added, removed } = diffLineStats(item.diffRows);
    return (
        <span className="tool-call-compact-edit">
            <span className="tool-call-compact-verb">{parts.verb}</span>
            {parts.detail.length > 0 ? (
                <>
                    {" "}
                    <CompactDetailText parts={parts} />
                </>
            ) : null}
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
    return <CompactVerbDetail parts={compactToolDetailParts(item)} />;
}

function CompactGroupSummary({
    items,
}: {
    items: TraceToolItem[];
}): ReactElement {
    const parts = compactToolGroupSummaryParts(items);
    if (parts === null) {
        return <CompactDetailLine item={items[0]!} />;
    }
    return (
        <>
            <span className="tool-call-compact-summary-verbs">{parts.verbs}</span>
            <span className="tool-call-compact-summary-counts">
                {" "}
                {parts.counts}
            </span>
        </>
    );
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
            <div className="tool-call-compact-summary">
                {single ? (
                    <CompactDetailLine item={items[0]!} />
                ) : (
                    <CompactGroupSummary items={items} />
                )}
            </div>
            {!single ? (
                <ul
                    className="tool-call-compact-details"
                    aria-label="Tool details"
                >
                    {items.map((item) => (
                        <li
                            key={item.toolCallId}
                            className="tool-call-compact-detail-row"
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
