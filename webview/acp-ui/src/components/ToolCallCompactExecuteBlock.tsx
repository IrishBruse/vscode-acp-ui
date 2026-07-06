import {
    type ReactElement,
    useEffect,
    useRef,
    useState,
} from "react";
import "./ToolCallCompactExecuteBlock.css";
import type { TraceToolItem } from "../chatReducer";
import {
    executeCommandText,
    executeOutputPreview,
} from "../toolCallCompactText";

/**
 * Compact terminal tool: command line plus a short output preview.
 */
export function ToolCallCompactExecuteBlock({
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

    const expanded = expandAllToolOutputs || localExpanded;
    const command = executeCommandText(item);
    const { previewLines, hiddenLineCount } = executeOutputPreview(
        item,
        expanded,
    );
    const inProgress =
        item.status === "pending" || item.status === "in_progress";

    return (
        <div
            className={
                className === undefined || className.length === 0
                    ? "tool-call-compact-execute"
                    : `tool-call-compact-execute ${className}`
            }
            data-tool-id={item.toolCallId}
            data-status={item.status}
            role="status"
            aria-label="Terminal command"
        >
            <div className="tool-call-compact-execute-command">
                <span
                    className="tool-call-compact-execute-prompt"
                    aria-hidden="true"
                >
                    $
                </span>
                <span className="tool-call-compact-execute-command-text">
                    {command.length > 0 ? command : "Terminal"}
                </span>
            </div>
            {previewLines.length > 0 ? (
                <pre className="tool-call-compact-execute-output">
                    {previewLines.join("\n")}
                </pre>
            ) : null}
            {hiddenLineCount > 0 ? (
                <button
                    type="button"
                    className="tool-call-compact-execute-hidden"
                    onClick={() => {
                        if (expanded) {
                            setLocalExpanded(false);
                            if (expandAllToolOutputs) {
                                onCollapseExpandAll?.();
                            }
                        } else {
                            setLocalExpanded(true);
                        }
                    }}
                >
                    ... {hiddenLineCount} output lines hidden · ctrl+o to
                    expand
                </button>
            ) : null}
            {inProgress && previewLines.length === 0 ? (
                <div className="tool-call-compact-execute-running">Running…</div>
            ) : null}
        </div>
    );
}
