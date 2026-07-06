import type { ReactElement } from "react";
import "./TraceList.css";
import type { ToolCallVerbosity } from "../../../src/protocol/extensionHostMessages";
import type { WorkspacePathOpenTarget } from "../../../src/protocol/extensionHostMessages";
import type { TraceItem, TraceToolItem } from "../chatReducer";
import { AgentMarkdown } from "./AgentMarkdown";
import { AgentThoughtBlock } from "./AgentThoughtBlock";
import { PlanBlock } from "./PlanBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolCallCompactBlock } from "./ToolCallCompactBlock";
import { ToolCallCompactExecuteBlock } from "./ToolCallCompactExecuteBlock";
import {
    compactGroupMaxVisibleDetails,
    isCompactGroupableTool,
} from "../toolCallCompactText";

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

type TraceRenderSegment =
    | { kind: "single"; item: TraceItem; index: number }
    | { kind: "toolGroup"; tools: TraceToolItem[]; index: number }
    | { kind: "toolCompactSingle"; tool: TraceToolItem; index: number }
    | { kind: "toolExecute"; tool: TraceToolItem; index: number };

function usesCompactToolPresentation(
    toolCallVerbosity: ToolCallVerbosity,
): boolean {
    return (
        toolCallVerbosity === "minimal" || toolCallVerbosity === "compact"
    );
}

function flushToolBuffer(
    segments: TraceRenderSegment[],
    toolBuffer: TraceToolItem[],
    groupStartIndex: number,
    toolCallVerbosity: ToolCallVerbosity,
): void {
    if (toolBuffer.length === 0) {
        return;
    }
    if (toolCallVerbosity === "minimal") {
        segments.push({
            kind: "toolGroup",
            tools: toolBuffer,
            index: groupStartIndex,
        });
    } else if (toolCallVerbosity === "compact") {
        for (let i = 0; i < toolBuffer.length; i++) {
            const tool = toolBuffer[i]!;
            segments.push({
                kind: "toolCompactSingle",
                tool,
                index: groupStartIndex + i,
            });
        }
    } else {
        for (let i = 0; i < toolBuffer.length; i++) {
            const tool = toolBuffer[i]!;
            segments.push({
                kind: "single",
                item: tool,
                index: groupStartIndex + i,
            });
        }
    }
}

function partitionTraceSegments(
    items: TraceItem[],
    showThoughts: boolean,
    toolCallVerbosity: ToolCallVerbosity,
): TraceRenderSegment[] {
    const segments: TraceRenderSegment[] = [];
    let toolBuffer: TraceToolItem[] = [];
    let groupStartIndex = -1;

    const flushTools = (): void => {
        flushToolBuffer(segments, toolBuffer, groupStartIndex, toolCallVerbosity);
        toolBuffer = [];
        groupStartIndex = -1;
    };

    for (let index = 0; index < items.length; index++) {
        const item = items[index]!;
        if (item.type === "thought" && !showThoughts) {
            continue;
        }
        if (item.type === "tool") {
            if (
                usesCompactToolPresentation(toolCallVerbosity) &&
                !isCompactGroupableTool(item)
            ) {
                flushTools();
                segments.push({ kind: "toolExecute", tool: item, index });
                continue;
            }
            if (toolCallVerbosity === "minimal") {
                if (toolBuffer.length === 0) {
                    groupStartIndex = index;
                }
                toolBuffer.push(item);
                continue;
            }
            if (toolCallVerbosity === "compact") {
                flushTools();
                segments.push({ kind: "toolCompactSingle", tool: item, index });
                continue;
            }
            if (toolBuffer.length === 0) {
                groupStartIndex = index;
            }
            toolBuffer.push(item);
            continue;
        }
        flushTools();
        segments.push({ kind: "single", item, index });
    }
    flushTools();
    return segments;
}

function visibleTraceType(
    item: TraceItem,
    showThoughts: boolean,
): TraceItem["type"] | undefined {
    if (item.type === "thought" && !showThoughts) {
        return undefined;
    }
    return item.type;
}

/**
 * Renders the conversation trace: user lines, streamed agent markdown, tool blocks, and plan blocks.
 */
export function TraceList({
    items,
    showThoughts,
    expandAllToolOutputs,
    toolCallVerbosity,
    onCollapseExpandAll,
    onOpenWorkspacePath,
}: {
    items: TraceItem[];
    showThoughts: boolean;
    expandAllToolOutputs: boolean;
    toolCallVerbosity: ToolCallVerbosity;
    onCollapseExpandAll?: () => void;
    onOpenWorkspacePath?: (
        path: string,
        options?: { target?: WorkspacePathOpenTarget },
    ) => void;
}): ReactElement {
    const segments = partitionTraceSegments(
        items,
        showThoughts,
        toolCallVerbosity,
    );
    let previousVisibleType: TraceItem["type"] | undefined;

    return (
        <>
            {segments.map((segment) => {
                if (segment.kind === "toolExecute") {
                    const gapClass = traceSegmentGapClass(
                        previousVisibleType,
                        "tool",
                    );
                    previousVisibleType = "tool";
                    return (
                        <ToolCallCompactExecuteBlock
                            key={segment.tool.toolCallId}
                            className={gapClass.trim()}
                            item={segment.tool}
                            expandAllToolOutputs={expandAllToolOutputs}
                            onCollapseExpandAll={onCollapseExpandAll}
                        />
                    );
                }

                if (segment.kind === "toolCompactSingle") {
                    const gapClass = traceSegmentGapClass(
                        previousVisibleType,
                        "tool",
                    );
                    previousVisibleType = "tool";
                    return (
                        <ToolCallCompactBlock
                            key={segment.tool.toolCallId}
                            className={gapClass.trim()}
                            items={[segment.tool]}
                            onOpenWorkspacePath={onOpenWorkspacePath}
                        />
                    );
                }

                if (segment.kind === "toolGroup") {
                    const gapClass = traceSegmentGapClass(
                        previousVisibleType,
                        "tool",
                    );
                    previousVisibleType = "tool";
                    return (
                        <ToolCallCompactBlock
                            key={segment.tools
                                .map((tool) => tool.toolCallId)
                                .join(":")}
                            className={gapClass.trim()}
                            items={segment.tools}
                            maxVisibleDetails={compactGroupMaxVisibleDetails}
                            onOpenWorkspacePath={onOpenWorkspacePath}
                        />
                    );
                }

                const item = segment.item;
                const currentType = visibleTraceType(item, showThoughts);
                if (currentType === undefined) {
                    return null;
                }
                const gapClass = traceSegmentGapClass(
                    previousVisibleType,
                    currentType,
                );
                previousVisibleType = currentType;

                if (item.type === "user") {
                    return (
                        <section
                            key={segment.index}
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
                            key={segment.index}
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
                            key={segment.index}
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
                        key={segment.index}
                        className={gapClass.trim()}
                        entries={item.entries}
                    />
                );
            })}
        </>
    );
}
