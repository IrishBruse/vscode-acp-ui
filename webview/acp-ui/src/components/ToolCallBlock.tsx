import {
    type KeyboardEvent,
    type ReactElement,
    useEffect,
    useRef,
    useState,
} from "react";
import "./ToolCallBlock.css";
import type { ToolCallStatus } from "../../../../src/protocol/extensionHostMessages";
import type { TraceToolItem } from "../chatReducer";

const collapsiblePreviewLineCount = 3;

const collapsibleDiffPreviewRowCount = 6;

function toolKindUsesCollapsiblePreview(kind: string | undefined): boolean {
    return kind === "read" || kind === "execute";
}

function collapsibleRegionAriaLabel(
    kind: string | undefined,
    expanded: boolean,
): string {
    const tail = expanded
        ? "all long outputs expanded; press Ctrl+O or ⌘O to collapse all"
        : "truncated; use Expand or press Ctrl+O or ⌘O to expand";
    if (kind === "read") {
        return `File preview, ${tail}`;
    }
    if (kind === "execute") {
        return `Terminal output, ${tail}`;
    }
    return `Tool output, ${tail}`;
}

function collapsibleDiffAriaLabel(expanded: boolean): string {
    const tail = expanded
        ? "full diff; press Ctrl+O or ⌘O to collapse long diffs"
        : "truncated; use Expand or press Ctrl+O or ⌘O to expand";
    return `File diff, ${tail}`;
}

function collapsibleHintText(expandAllGlobal: boolean): string {
    return expandAllGlobal
        ? "Press Ctrl+O or ⌘O to collapse all long outputs."
        : "Press Ctrl+O or ⌘O to expand all long outputs.";
}

function CollapsibleHintRow({
    expandAllGlobal,
    expanded,
    onExpandThis,
    onCollapseThis,
}: {
    expandAllGlobal: boolean;
    expanded: boolean;
    onExpandThis: () => void;
    onCollapseThis: () => void;
}): ReactElement {
    return (
        <p className="tool-call-collapsible-hint">
            <button
                type="button"
                className="tool-call-collapsible-expand"
                onClick={(e) => {
                    e.stopPropagation();
                    if (expanded) {
                        onCollapseThis();
                    } else {
                        onExpandThis();
                    }
                }}
                aria-label={
                    expanded
                        ? "Collapse this tool output"
                        : "Expand this tool output"
                }
            >
                {expanded ? "Collapse" : "Expand"}
            </button>
            <span className="tool-call-collapsible-hint-text">
                {collapsibleHintText(expandAllGlobal)}
            </span>
        </p>
    );
}

/**
 * Resolves the shell command text for the execute tool header (subtitle from the bridge, else backtick-wrapped title).
 */
function commandLineForExecuteTitle(item: TraceToolItem): string | null {
    const sub = item.subtitle?.trim() ?? "";
    if (sub.length > 0) {
        const withoutPrompt = sub.startsWith("$")
            ? sub.slice(1).trimStart()
            : sub;
        return withoutPrompt.length > 0 ? withoutPrompt : null;
    }
    const tit = item.title.trim();
    if (tit.length >= 2 && tit.startsWith("`") && tit.endsWith("`")) {
        const inner = tit.slice(1, -1).trim();
        return inner.length > 0 ? inner : null;
    }
    return null;
}

function ToolCallStatusGlyph({
    status,
}: {
    status: ToolCallStatus;
}): ReactElement {
    if (status === "in_progress" || status === "pending") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--in-progress"
                aria-hidden="true"
            />
        );
    }
    if (status === "completed") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--completed"
                aria-hidden="true"
            />
        );
    }
    return (
        <span
            className="tool-call-terminal-status tool-call-terminal-status--failed"
            aria-hidden="true"
        >
            {"\u2715"}
        </span>
    );
}

/**
 * Renders a tool invocation as a compact integrated-terminal style block (prompt line + optional output).
 */
export function ToolCallBlock({
    item,
    expandAllToolOutputs,
    onCollapseExpandAll,
    className,
}: {
    item: TraceToolItem;
    expandAllToolOutputs: boolean;
    onCollapseExpandAll?: () => void;
    className?: string;
}): ReactElement {
    const [localExpanded, setLocalExpanded] = useState(false);
    const prevExpandAllRef = useRef(expandAllToolOutputs);
    useEffect(() => {
        if (prevExpandAllRef.current && !expandAllToolOutputs) {
            setLocalExpanded(false);
        }
        prevExpandAllRef.current = expandAllToolOutputs;
    }, [expandAllToolOutputs]);
    const expandedThis = expandAllToolOutputs || localExpanded;

    const kindHidden = item.kind === undefined || item.kind.length === 0;
    const hasDiff = item.diffRows !== undefined && item.diffRows.length > 0;
    const showOutput =
        item.detailVisible &&
        (hasDiff ||
            (item.content !== undefined && item.content.trim().length > 0));
    const subtitle =
        item.kind !== "execute" &&
        item.subtitle !== undefined &&
        item.subtitle.trim().length > 0
            ? item.subtitle.trim()
            : null;
    const executeCommandLine =
        item.kind === "execute" ? commandLineForExecuteTitle(item) : null;
    const contentText = item.content ?? "";
    const contentLines = contentText.split(/\r?\n/);
    const outputCollapsible =
        !hasDiff &&
        showOutput &&
        toolKindUsesCollapsiblePreview(item.kind) &&
        contentLines.length > collapsiblePreviewLineCount;
    const displayedOutput =
        outputCollapsible && !expandedThis
            ? contentLines.slice(0, collapsiblePreviewLineCount).join("\n")
            : contentText;
    const diffRows = item.diffRows;
    const diffCollapsible =
        hasDiff &&
        diffRows !== undefined &&
        diffRows.length > collapsibleDiffPreviewRowCount;
    const displayedDiffRows =
        diffCollapsible && !expandedThis
            ? diffRows.slice(0, collapsibleDiffPreviewRowCount)
            : (diffRows ?? []);

    const headerCollapsible =
        showOutput && (diffCollapsible || outputCollapsible);

    const collapseThisOutput = (): void => {
        setLocalExpanded(false);
        if (expandAllToolOutputs) {
            onCollapseExpandAll?.();
        }
    };

    const expandThisOutput = (): void => {
        setLocalExpanded(true);
    };

    const onHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (!headerCollapsible) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (expandedThis) {
                collapseThisOutput();
            } else {
                expandThisOutput();
            }
        }
    };

    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "tool-call-terminal"
                    : `tool-call-terminal ${className}`
            }
            data-tool-id={item.toolCallId}
            data-status={item.status}
            role="status"
            aria-label="Tool use"
        >
            <div
                className={
                    headerCollapsible
                        ? "tool-call-terminal-line tool-call-terminal-line--expandable"
                        : "tool-call-terminal-line"
                }
                onClick={
                    headerCollapsible
                        ? () => {
                              if (expandedThis) {
                                  collapseThisOutput();
                              } else {
                                  expandThisOutput();
                              }
                          }
                        : undefined
                }
                onKeyDown={onHeaderKeyDown}
                role={headerCollapsible ? "button" : undefined}
                tabIndex={headerCollapsible ? 0 : undefined}
                aria-label={
                    headerCollapsible
                        ? expandedThis
                            ? "Collapse this tool output"
                            : "Expand this tool output"
                        : undefined
                }
            >
                {item.kind === "execute" ? (
                    <>
                        <div className="tool-call-terminal-line-main">
                            <ToolCallStatusGlyph status={item.status} />
                            <span className="tool-call-terminal-title tool-call-terminal-title--execute">
                                {executeCommandLine === null ? (
                                    "Terminal"
                                ) : (
                                    <>
                                        <span
                                            className="tool-call-terminal-prompt tool-call-terminal-prompt--inline"
                                            aria-hidden="true"
                                        >
                                            $
                                        </span>
                                        <span className="tool-call-terminal-command-text">
                                            {executeCommandLine}
                                        </span>
                                    </>
                                )}
                            </span>
                        </div>
                        {kindHidden ? null : (
                            <span className="tool-call-terminal-kind">
                                [{item.kind}]
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <ToolCallStatusGlyph status={item.status} />
                        <span className="tool-call-terminal-title">
                            {item.title}
                        </span>
                        {kindHidden ? null : (
                            <span className="tool-call-terminal-kind">
                                [{item.kind}]
                            </span>
                        )}
                    </>
                )}
            </div>
            {subtitle !== null ? (
                <div className="tool-call-terminal-subtitle">{subtitle}</div>
            ) : null}
            {showOutput && hasDiff ? (
                diffCollapsible && !expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={expandedThis}
                        aria-label={collapsibleDiffAriaLabel(expandedThis)}
                    >
                        <div
                            className="tool-call-diff"
                            role="group"
                            aria-label="File diff preview"
                        >
                            {displayedDiffRows.map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={
                                        row.kind === "removed"
                                            ? "tool-call-diff-line tool-call-diff-line--removed"
                                            : row.kind === "added"
                                              ? "tool-call-diff-line tool-call-diff-line--added"
                                              : "tool-call-diff-line tool-call-diff-line--context"
                                    }
                                >
                                    <span
                                        className="tool-call-diff-prefix"
                                        aria-hidden="true"
                                    >
                                        {row.kind === "removed"
                                            ? "-"
                                            : row.kind === "added"
                                              ? "+"
                                              : " "}
                                    </span>
                                    <span className="tool-call-diff-text">
                                        {row.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                            expanded={false}
                            onExpandThis={expandThisOutput}
                            onCollapseThis={collapseThisOutput}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="tool-call-diff"
                            role="group"
                            aria-label="File diff"
                        >
                            {(diffRows ?? []).map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={
                                        row.kind === "removed"
                                            ? "tool-call-diff-line tool-call-diff-line--removed"
                                            : row.kind === "added"
                                              ? "tool-call-diff-line tool-call-diff-line--added"
                                              : "tool-call-diff-line tool-call-diff-line--context"
                                    }
                                >
                                    <span
                                        className="tool-call-diff-prefix"
                                        aria-hidden="true"
                                    >
                                        {row.kind === "removed"
                                            ? "-"
                                            : row.kind === "added"
                                              ? "+"
                                              : " "}
                                    </span>
                                    <span className="tool-call-diff-text">
                                        {row.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {diffCollapsible && expandedThis ? (
                            <CollapsibleHintRow
                                expandAllGlobal={expandAllToolOutputs}
                                expanded={true}
                                onExpandThis={expandThisOutput}
                                onCollapseThis={collapseThisOutput}
                            />
                        ) : null}
                    </>
                )
            ) : showOutput ? (
                outputCollapsible && !expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={expandedThis}
                        aria-label={collapsibleRegionAriaLabel(
                            item.kind,
                            expandedThis,
                        )}
                    >
                        <pre className="tool-call-terminal-pre tool-call-terminal-pre--collapsible">
                            {displayedOutput}
                        </pre>
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                            expanded={false}
                            onExpandThis={expandThisOutput}
                            onCollapseThis={collapseThisOutput}
                        />
                    </div>
                ) : outputCollapsible && expandedThis ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={true}
                        aria-label={collapsibleRegionAriaLabel(item.kind, true)}
                    >
                        <pre className="tool-call-terminal-pre">
                            {contentText}
                        </pre>
                        <CollapsibleHintRow
                            expandAllGlobal={expandAllToolOutputs}
                            expanded={true}
                            onExpandThis={expandThisOutput}
                            onCollapseThis={collapseThisOutput}
                        />
                    </div>
                ) : (
                    <pre className="tool-call-terminal-pre">{contentText}</pre>
                )
            ) : null}
        </div>
    );
}
