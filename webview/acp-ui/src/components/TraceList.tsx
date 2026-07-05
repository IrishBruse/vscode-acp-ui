import type { ReactElement } from "react";
import "./TraceList.css";
import type { TraceItem } from "../chatReducer";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentThoughtBlock } from "./AgentThoughtBlock";
import { PlanBlock } from "./PlanBlock";
import { ToolCallBlock } from "./ToolCallBlock";

function traceSegmentGapClass(
    previousType: TraceItem["type"] | undefined,
    currentType: TraceItem["type"],
): string {
    if (previousType === undefined) {
        return "";
    }
    const isAgentResponse = (type: TraceItem["type"]) => type === "agent";
    if (isAgentResponse(previousType) === isAgentResponse(currentType)) {
        return "";
    }
    return " trace-segment-gap";
}

/**
 * Renders the conversation trace: user lines, streamed agent markdown, tool blocks, and plan blocks.
 */
export function TraceList({
    items,
    showThoughts,
    expandAllToolOutputs,
    onCollapseExpandAll,
}: {
    items: TraceItem[];
    showThoughts: boolean;
    expandAllToolOutputs: boolean;
    onCollapseExpandAll?: () => void;
}): ReactElement {
    let previousVisibleType: TraceItem["type"] | undefined;

    return (
        <>
            {items.map((item, index) => {
                if (item.type === "thought" && !showThoughts) {
                    return null;
                }
                const gapClass = traceSegmentGapClass(
                    previousVisibleType,
                    item.type,
                );
                previousVisibleType = item.type;

                if (item.type === "user") {
                    return (
                        <section
                            key={index}
                            className={`user-prompt-bar${gapClass}`}
                            aria-label="User message"
                        >
                            {item.text}
                        </section>
                    );
                }
                if (item.type === "agent") {
                    return (
                        <div
                            key={index}
                            className={`agent-response-stream${gapClass}`}
                        >
                            <div
                                className="agent-response-markdown"
                                aria-label="Agent response"
                            >
                                <AgentMarkdown text={item.text} />
                            </div>
                        </div>
                    );
                }
                if (item.type === "thought") {
                    return (
                        <AgentThoughtBlock
                            key={index}
                            className={gapClass.trim()}
                            text={item.text}
                            durationMs={item.durationMs}
                        />
                    );
                }
                if (item.type === "tool") {
                    return (
                        <ToolCallBlock
                            key={item.toolCallId}
                            className={gapClass.trim()}
                            item={item}
                            expandAllToolOutputs={expandAllToolOutputs}
                            onCollapseExpandAll={onCollapseExpandAll}
                        />
                    );
                }
                return (
                    <PlanBlock
                        key={index}
                        className={gapClass.trim()}
                        entries={item.entries}
                    />
                );
            })}
        </>
    );
}
