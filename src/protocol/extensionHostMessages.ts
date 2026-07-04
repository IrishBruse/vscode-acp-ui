import type { AcpUiSessionModelSelection } from "../acp/session/sessionModels";

/** Replayable session log events (user submit + post-init extension messages). */
export type AcpUiHistoryReplayEvent =
    | { type: "submit"; body: string }
    | Exclude<
          ExtensionToWebviewMessage,
          { type: "init" } | { type: "historyReplay" }
      >;

/** Plan entry forwarded from an ACP agent plan update. */
export type PlanEntry = {
    content: string;
    status: string;
    priority?: string;
};

export type TodoEntry = {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
};

/** Tool call status forwarded from ACP. */
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

/** Line-level diff for tool output (git-style presentation in a webview). */
export type ToolCallDiffRow = {
    kind: "removed" | "added" | "context";
    text: string;
};

/** Slash commands advertised by the agent via `available_commands_update`. */
export type AcpUiSlashCommand = {
    name: string;
    description: string;
    inputHint?: string;
    /** Origin label from the agent (for example user, global, workspace). */
    source?: string;
};

/**
 * Messages sent from a webview (or other UI host) to the extension host.
 */
export type WebviewToExtensionMessage =
    | { type: "ready" }
    | { type: "send"; body: string }
    | { type: "cancel" }
    | { type: "renameSession"; title: string }
    /** Dispose the current agent session and start a fresh one (same editor / WS connection). */
    | { type: "resetSession" }
    | { type: "setSessionModel"; modelId: string }
    | { type: "setSessionAgent"; agentName: string }
    | {
          type: "permissionResponse";
          requestId: string;
          selectedOptionId: string;
      }
    | { type: "permissionResponse"; requestId: string; cancelled: true }
    | {
          type: "cursorAskQuestionResponse";
          requestId: string;
          outcome:
              | {
                    outcome: "answered";
                    answers: Array<{
                        questionId: string;
                        selectedOptionIds: string[];
                    }>;
                }
              | { outcome: "skipped"; reason?: string }
              | { outcome: "cancelled" };
      }
    | {
          type: "cursorCreatePlanResponse";
          requestId: string;
          outcome:
              | { outcome: "accepted"; planUri?: string }
              | { outcome: "rejected"; reason?: string }
              | { outcome: "cancelled" };
      }
    /** Persists composer Arrow Up / Down prompt history for this session. */
    | { type: "savePromptHistory"; entries: string[] };

/**
 * Messages sent from the extension host to a webview (or other UI host).
 */
export type ExtensionToWebviewMessage =
    | {
          type: "init";
          sessionId: string;
          title: string;
          workspaceLabel?: string;
          /** Relative workspace file paths used by `@` autocomplete in the composer. */
          workspaceFiles?: string[];
          agentVersionLabel?: string;
          acpAgentName?: string;
          /** Display names from `ib-acp-ui.agents` for the agent picker. */
          availableAcpAgents?: string[];
          /** Optional `--vscode-*` overrides applied on `document.documentElement`. */
          vscodeThemeVariables?: Record<string, string>;
          sessionModels?: AcpUiSessionModelSelection;
          promptHistory?: string[];
          /**
           * When true, the agent picker is read-only (agent was chosen when the chat was created).
           * The model picker may still change until the first user message in standalone mode.
           */
          lockSessionAgent?: boolean;
      }
    | {
          type: "sessionModels";
          currentModelId: string;
          availableModels: AcpUiSessionModelSelection["availableModels"];
      }
    | {
          type: "acpAgentSelection";
          currentAgentName: string;
          availableAgentNames: string[];
      }
    | { type: "appendAgentThought"; text: string; durationMs?: number }
    | { type: "appendAgentText"; text: string }
    | {
          type: "appendToolCall";
          toolCallId: string;
          title: string;
          kind?: string;
          status?: ToolCallStatus;
          subtitle?: string;
      }
    | {
          type: "updateToolCall";
          toolCallId: string;
          status: ToolCallStatus;
          content?: string;
          subtitle?: string;
          diffRows?: ToolCallDiffRow[];
          /** From ACP `tool_call_update` when the agent omits an initial `tool_call` (e.g. Gemini CLI). */
          kind?: string;
      }
    | {
          type: "permissionRequest";
          requestId: string;
          toolTitle: string;
          options: { optionId: string; name: string }[];
      }
    | {
          type: "cursorAskQuestionRequest";
          requestId: string;
          title?: string;
          questions: Array<{
              id: string;
              prompt: string;
              options: Array<{ id: string; label: string }>;
              allowMultiple?: boolean;
          }>;
      }
    | {
          type: "cursorCreatePlanRequest";
          requestId: string;
          name?: string;
          overview?: string;
          plan: string;
          todos: TodoEntry[];
          isProject?: boolean;
          phases?: Array<{ name: string; todos: TodoEntry[] }>;
      }
    | {
          type: "cursorUpdateTodos";
          toolCallId: string;
          todos: TodoEntry[];
          merge: boolean;
      }
    | {
          type: "cursorTask";
          toolCallId: string;
          description: string;
          prompt: string;
          subagentType: string;
          model?: string;
          agentId?: string;
          durationMs?: number;
      }
    | {
          type: "cursorGenerateImage";
          toolCallId: string;
          description: string;
          filePath?: string;
          referenceImagePaths?: string[];
      }
    | { type: "slashCommands"; commands: AcpUiSlashCommand[] }
    | { type: "appendPlan"; entries: PlanEntry[] }
    | { type: "commandFeedback"; message: string }
    | { type: "turnComplete"; stopReason: string }
    | { type: "error"; message: string }
    /** Clears the transcript and tool state; sent before the host reconnects the agent session. */
    | { type: "sessionReset" }
    /** Replays persisted session log lines after `init` (custom editor restore). */
    | { type: "historyReplay"; events: AcpUiHistoryReplayEvent[] };

/**
 * True when `raw` is a non-null object (`typeof null === "object"` is excluded).
 */
export function isPotentiallyExtensionPostMessageData(
    raw: unknown,
): raw is Record<string, unknown> {
    return raw !== null && typeof raw === "object";
}

/**
 * Parses an untrusted `postMessage` payload from a webview.
 */
export function tryParseWebviewMessage(
    raw: unknown,
): WebviewToExtensionMessage | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const messageType = record.type;
    if (messageType === "ready") {
        return { type: "ready" };
    }
    if (messageType === "send" && typeof record.body === "string") {
        return { type: "send", body: record.body };
    }
    if (messageType === "cancel") {
        return { type: "cancel" };
    }
    if (messageType === "renameSession" && typeof record.title === "string") {
        return { type: "renameSession", title: record.title };
    }
    if (messageType === "resetSession") {
        return { type: "resetSession" };
    }
    if (
        messageType === "setSessionModel" &&
        typeof record.modelId === "string" &&
        record.modelId.length > 0
    ) {
        return { type: "setSessionModel", modelId: record.modelId };
    }
    if (
        messageType === "setSessionAgent" &&
        typeof record.agentName === "string" &&
        record.agentName.length > 0
    ) {
        return { type: "setSessionAgent", agentName: record.agentName };
    }
    if (
        messageType === "permissionResponse" &&
        typeof record.requestId === "string" &&
        record.requestId.length > 0
    ) {
        if (record.cancelled === true) {
            return {
                type: "permissionResponse",
                requestId: record.requestId,
                cancelled: true,
            };
        }
        if (
            typeof record.selectedOptionId === "string" &&
            record.selectedOptionId.length > 0
        ) {
            return {
                type: "permissionResponse",
                requestId: record.requestId,
                selectedOptionId: record.selectedOptionId,
            };
        }
    }
    if (
        messageType === "cursorAskQuestionResponse" &&
        typeof record.requestId === "string" &&
        record.requestId.length > 0 &&
        record.outcome !== undefined &&
        record.outcome !== null &&
        typeof record.outcome === "object"
    ) {
        return {
            type: "cursorAskQuestionResponse",
            requestId: record.requestId,
            outcome: record.outcome as Extract<
                WebviewToExtensionMessage,
                { type: "cursorAskQuestionResponse" }
            >["outcome"],
        };
    }
    if (
        messageType === "cursorCreatePlanResponse" &&
        typeof record.requestId === "string" &&
        record.requestId.length > 0 &&
        record.outcome !== undefined &&
        record.outcome !== null &&
        typeof record.outcome === "object"
    ) {
        return {
            type: "cursorCreatePlanResponse",
            requestId: record.requestId,
            outcome: record.outcome as Extract<
                WebviewToExtensionMessage,
                { type: "cursorCreatePlanResponse" }
            >["outcome"],
        };
    }
    if (messageType === "savePromptHistory" && Array.isArray(record.entries)) {
        const entries: string[] = [];
        for (const item of record.entries) {
            if (typeof item !== "string") {
                continue;
            }
            entries.push(item);
            if (entries.length >= 55) {
                break;
            }
        }
        return { type: "savePromptHistory", entries };
    }
    return null;
}
