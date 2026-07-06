import type { MouseEvent, ReactElement } from "react";
import "./ToolCallCompactBlock.css";
import type { TraceToolItem } from "../chatReducer";
import {
    type CompactToolDetailParts,
    compactToolDetailParts,
    compactToolGroupSummaryParts,
    compactToolShowsDiffStats,
    diffLineStats,
} from "../toolCallCompactText";

function openPathClick(
    event: MouseEvent<HTMLAnchorElement>,
    openPath: string,
    onOpenWorkspacePath: ((path: string) => void) | undefined,
): void {
    event.preventDefault();
    onOpenWorkspacePath?.(openPath);
}

function CompactPathLink({
    segment,
    onOpenWorkspacePath,
}: {
    segment: NonNullable<CompactToolDetailParts["pathSegment"]>;
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    return (
        <a
            className="tool-call-compact-path-link"
            href="#"
            onClick={(event) => {
                openPathClick(event, segment.openPath, onOpenWorkspacePath);
            }}
        >
            <span className="tool-call-compact-path-short">{segment.label}</span>
            <span className="tool-call-compact-path-full">{segment.title}</span>
        </a>
    );
}

function CompactDetailText({
    parts,
    onOpenWorkspacePath,
}: {
    parts: CompactToolDetailParts;
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    const segment = parts.pathSegment;
    if (segment === undefined) {
        return (
            <span className="tool-call-compact-detail-text">{parts.detail}</span>
        );
    }
    return (
        <span className="tool-call-compact-detail-text">
            {segment.prefix ?? null}
            <CompactPathLink
                segment={segment}
                onOpenWorkspacePath={onOpenWorkspacePath}
            />
            {segment.suffix ?? null}
        </span>
    );
}

function CompactVerbDetail({
    parts,
    onOpenWorkspacePath,
}: {
    parts: CompactToolDetailParts;
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    return (
        <>
            <span className="tool-call-compact-verb">{parts.verb}</span>
            {parts.detail.length > 0 ? (
                <>
                    {" "}
                    <CompactDetailText
                        parts={parts}
                        onOpenWorkspacePath={onOpenWorkspacePath}
                    />
                </>
            ) : null}
        </>
    );
}

function CompactEditLine({
    item,
    onOpenWorkspacePath,
}: {
    item: TraceToolItem;
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    const parts = compactToolDetailParts(item);
    const { added, removed } = diffLineStats(item.diffRows);
    return (
        <span className="tool-call-compact-edit">
            <span className="tool-call-compact-verb">{parts.verb}</span>
            {parts.detail.length > 0 ? (
                <>
                    {" "}
                    <CompactDetailText
                        parts={parts}
                        onOpenWorkspacePath={onOpenWorkspacePath}
                    />
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

function CompactDetailLine({
    item,
    onOpenWorkspacePath,
}: {
    item: TraceToolItem;
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    if (compactToolShowsDiffStats(item)) {
        return (
            <CompactEditLine
                item={item}
                onOpenWorkspacePath={onOpenWorkspacePath}
            />
        );
    }
    return (
        <CompactVerbDetail
            parts={compactToolDetailParts(item)}
            onOpenWorkspacePath={onOpenWorkspacePath}
        />
    );
}

function CompactGroupSummary({
    items,
    onOpenWorkspacePath,
}: {
    items: TraceToolItem[];
    onOpenWorkspacePath: ((path: string) => void) | undefined;
}): ReactElement {
    const parts = compactToolGroupSummaryParts(items);
    if (parts === null) {
        return (
            <CompactDetailLine
                item={items[0]!}
                onOpenWorkspacePath={onOpenWorkspacePath}
            />
        );
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
    onOpenWorkspacePath,
}: {
    items: TraceToolItem[];
    className?: string;
    onOpenWorkspacePath?: (path: string) => void;
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
                    <CompactDetailLine
                        item={items[0]!}
                        onOpenWorkspacePath={onOpenWorkspacePath}
                    />
                ) : (
                    <CompactGroupSummary
                        items={items}
                        onOpenWorkspacePath={onOpenWorkspacePath}
                    />
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
                            <CompactDetailLine
                                item={item}
                                onOpenWorkspacePath={onOpenWorkspacePath}
                            />
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
