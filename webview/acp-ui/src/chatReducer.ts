import type { AcpUiSessionModelSelection } from "../../../src/acp/session/sessionModels";
import {
    modelConfigOption,
    modelParamCacheKey,
    resolvedModelParamOptionsForModelPick,
    type AcpUiSessionConfigOption,
} from "../../../src/acp/session/sessionConfigOptions";
import {
    cacheModelParamOptionsFromSession,
    readCachedModelParamOptions,
    writeCachedSessionConfigOptions,
    writeCachedSessionModels,
} from "../../../src/acp/session/sessionConfigOptionsCache";
import type {
    ExtensionToWebviewMessage,
    AcpUiSlashCommand,
    PlanEntry,
    TodoEntry,
    ToolCallDiffRow,
    ToolCallStatus,
} from "../../../src/protocol/extensionHostMessages";

export type InitPayload = Extract<ExtensionToWebviewMessage, { type: "init" }>;
export type ExtensionMessageAfterInit = Exclude<
    ExtensionToWebviewMessage,
    { type: "init" }
>;

export type TraceToolItem = {
    type: "tool";
    toolCallId: string;
    title: string;
    kind: string | undefined;
    /** Dim terminal-style line (paths, args, preview); from ACP at tool start. */
    subtitle: string | undefined;
    status: ToolCallStatus;
    content: string | undefined;
    /** Structured diff when the agent sent `diff` content (preferred over plain `content`). */
    diffRows: ToolCallDiffRow[] | undefined;
    detailVisible: boolean;
};

export type TraceItem =
    | { type: "user"; text: string }
    | { type: "thought"; text: string; durationMs?: number }
    | { type: "agent"; text: string }
    | TraceToolItem
    | { type: "plan"; entries: PlanEntry[] };

export type AcpAgentSelectionState = {
    currentName: string;
    availableNames: string[];
};

export type PermissionPromptState = {
    requestId: string;
    toolTitle: string;
    options: { optionId: string; name: string }[];
};

export type AskQuestionPromptState = Extract<
    ExtensionToWebviewMessage,
    { type: "cursorAskQuestionRequest" }
>;

export type CreatePlanPromptState = Extract<
    ExtensionToWebviewMessage,
    { type: "cursorCreatePlanRequest" }
>;

export type ChatState = {
    trace: TraceItem[];
    openStreamIndex: number | null;
    toolIndexById: Map<string, number>;
    promptInFlight: boolean;
    errorText: string | null;
    modelSelection: AcpUiSessionModelSelection | null;
    sessionConfigOptions: AcpUiSessionConfigOption[] | null;
    /** True while waiting for agent model/config options (uncached reconnect). */
    sessionConfigLoading: boolean;
    acpAgentSelection: AcpAgentSelectionState | null;
    slashCommands: AcpUiSlashCommand[];
    permissionPrompt: PermissionPromptState | null;
    askQuestionPrompt: AskQuestionPromptState | null;
    createPlanPrompt: CreatePlanPromptState | null;
    /**
     * From host init: agent was fixed when the chat was created (VS Code sidebar flow).
     */
    lockSessionAgent: boolean;
    /**
     * After the first real user message, model + agent pickers are read-only (standalone pre-flight).
     */
    composerPicksLocked: boolean;
};

export type ChatAction =
    | ExtensionMessageAfterInit
    | { type: "submit"; body: string }
    | { type: "pickSessionModel"; modelId: string }
    | {
          type: "pickSessionConfigOption";
          configId: string;
          value: string | boolean;
      }
    | { type: "clearPermissionPrompt" }
    | { type: "clearAskQuestionPrompt" }
    | { type: "clearCreatePlanPrompt" };

const EDIT_TOOL_DISPLAY_TITLE = "Write File";

/** Stable header for ACP `kind: edit` tools (file write / diff), ignoring verbose agent titles. */
function toolDisplayTitle(
    kind: string | undefined,
    agentTitle: string,
): string {
    if (kind !== undefined && kind.toLowerCase() === "edit") {
        return EDIT_TOOL_DISPLAY_TITLE;
    }
    const t = agentTitle.trim();
    return t.length > 0 ? t : "Tool";
}

function modelSelectionFromConfigOptions(
    options: AcpUiSessionConfigOption[],
): AcpUiSessionModelSelection | null {
    const modelOption = options.find(
        (option) => option.type === "select" && option.category === "model",
    );
    if (modelOption?.type !== "select") {
        return null;
    }
    return {
        currentModelId: modelOption.currentValue,
        availableModels: modelOption.options.map((choice) => ({
            modelId: choice.value,
            name: choice.name,
        })),
    };
}

function isModelConfigPick(
    options: ReadonlyArray<AcpUiSessionConfigOption>,
    configId: string,
): boolean {
    const option = options.find((row) => row.configId === configId);
    return option?.type === "select" && option.category === "model";
}

function agentNameFromState(state: ChatState): string {
    return state.acpAgentSelection?.currentName ?? "";
}

function applySessionConfigOptions(
    state: ChatState,
    options: AcpUiSessionConfigOption[],
): ChatState {
    const agentName = agentNameFromState(state);
    if (agentName.length > 0) {
        cacheModelParamOptionsFromSession(agentName, options);
        writeCachedSessionConfigOptions(agentName, options);
    }
    const modelSelection = modelSelectionFromConfigOptions(options);
    return {
        ...state,
        sessionConfigOptions: options,
        sessionConfigLoading: false,
        ...(modelSelection !== null ? { modelSelection } : {}),
    };
}

function applySessionConfigOptionsLoading(state: ChatState): ChatState {
    return {
        ...state,
        sessionConfigOptions: null,
        modelSelection: null,
        sessionConfigLoading: true,
    };
}

export function createInitialChatState(): ChatState {
    return {
        trace: [],
        openStreamIndex: null,
        toolIndexById: new Map(),
        promptInFlight: false,
        errorText: null,
        modelSelection: null,
        sessionConfigOptions: null,
        sessionConfigLoading: true,
        acpAgentSelection: null,
        slashCommands: [],
        permissionPrompt: null,
        askQuestionPrompt: null,
        createPlanPrompt: null,
        lockSessionAgent: false,
        composerPicksLocked: false,
    };
}

/**
 * Builds initial chat state from the host `init` payload (model list from ACP or standalone readme seed).
 */
export function createChatStateFromInit(payload: InitPayload): ChatState {
    const base: ChatState = {
        ...createInitialChatState(),
        acpAgentSelection: buildAcpAgentSelectionFromInit(payload),
        lockSessionAgent: payload.lockSessionAgent === true,
        composerPicksLocked: false,
    };
    if (
        payload.sessionConfigOptionsSeed !== undefined &&
        payload.sessionConfigOptionsSeed.length > 0
    ) {
        return applySessionConfigOptions(base, payload.sessionConfigOptionsSeed);
    }
    const hasBootstrapModels =
        payload.sessionModels !== undefined &&
        payload.sessionModels.availableModels.length > 0;
    return {
        ...base,
        modelSelection: payload.sessionModels ?? null,
        sessionConfigLoading: !hasBootstrapModels,
    };
}

function buildAcpAgentSelectionFromInit(
    payload: InitPayload,
): AcpAgentSelectionState | null {
    const listed = payload.availableAcpAgents;
    const named = payload.acpAgentName;
    if (listed !== undefined && listed.length > 0) {
        const current =
            named !== undefined && named.length > 0 && listed.includes(named)
                ? named
                : listed[0]!;
        return { currentName: current, availableNames: listed };
    }
    if (named !== undefined && named.length > 0) {
        return { currentName: named, availableNames: [named] };
    }
    return null;
}

function appendUserText(state: ChatState, text: string): ChatState {
    const last = state.trace[state.trace.length - 1];
    if (last?.type === "user") {
        const trace = state.trace.slice();
        trace[trace.length - 1] = { type: "user", text: last.text + text };
        return { ...state, trace };
    }
    return {
        ...state,
        trace: [...state.trace, { type: "user" as const, text }],
    };
}

function appendAgentText(state: ChatState, text: string): ChatState {
    const open = state.openStreamIndex;
    if (open !== null) {
        const existing = state.trace[open];
        if (existing?.type === "agent") {
            const trace = state.trace.slice();
            trace[open] = { type: "agent", text: existing.text + text };
            return { ...state, trace };
        }
    }
    const trace = [...state.trace, { type: "agent" as const, text }];
    return {
        ...state,
        trace,
        openStreamIndex: trace.length - 1,
    };
}

function appendAgentThought(
    state: ChatState,
    text: string,
    durationMs: number | undefined,
): ChatState {
    const open = state.openStreamIndex;
    if (open !== null) {
        const existing = state.trace[open];
        if (existing?.type === "thought") {
            const mergedDuration =
                durationMs !== undefined ? durationMs : existing.durationMs;
            const trace = state.trace.slice();
            trace[open] = {
                type: "thought",
                text: joinThoughtChunks(existing.text, text),
                ...(mergedDuration !== undefined
                    ? { durationMs: mergedDuration }
                    : {}),
            };
            return { ...state, trace };
        }
    }
    const trace = [
        ...state.trace,
        {
            type: "thought" as const,
            text,
            ...(durationMs !== undefined ? { durationMs } : {}),
        },
    ];
    return {
        ...state,
        trace,
        openStreamIndex: trace.length - 1,
    };
}

function isWordChar(char: string): boolean {
    return /[\p{L}\p{N}_]/u.test(char);
}

function opensFenceBoundary(text: string): boolean {
    const fences = text.match(/```/g);
    return (fences?.length ?? 0) % 2 === 1;
}

function startsWithPunctuation(text: string): boolean {
    return /^[,.;:!?]/.test(text);
}

/**
 * Joins streamed thought chunks with natural spacing outside fenced code blocks.
 */
export function joinThoughtChunks(existing: string, incoming: string): string {
    if (existing.length === 0 || incoming.length === 0) {
        return existing + incoming;
    }
    if (opensFenceBoundary(existing)) {
        return existing + incoming;
    }
    const existingEndsWithWhitespace = /\s$/.test(existing);
    const incomingStartsWithWhitespace = /^\s/.test(incoming);
    if (existingEndsWithWhitespace || incomingStartsWithWhitespace) {
        return existing + incoming;
    }
    const existingLast = existing.at(-1) ?? "";
    const incomingFirst = incoming[0] ?? "";
    if (
        isWordChar(existingLast) &&
        isWordChar(incomingFirst) &&
        !startsWithPunctuation(incoming)
    ) {
        return `${existing} ${incoming}`;
    }
    return existing + incoming;
}

function appendToolCall(
    state: ChatState,
    toolCallId: string,
    title: string,
    kind: string | undefined,
    status: ToolCallStatus | undefined,
    subtitle: string | undefined,
): ChatState {
    const existingIdx = state.toolIndexById.get(toolCallId);
    if (existingIdx !== undefined) {
        const existing = state.trace[existingIdx];
        if (existing?.type === "tool") {
            const mergedSubtitle =
                subtitle !== undefined && subtitle.trim().length > 0
                    ? subtitle.trim()
                    : existing.subtitle;
            const trace = state.trace.slice();
            trace[existingIdx] = {
                ...existing,
                title: toolDisplayTitle(
                    kind !== undefined ? kind : existing.kind,
                    title,
                ),
                kind: kind !== undefined ? kind : existing.kind,
                status: status ?? existing.status,
                subtitle: mergedSubtitle,
            };
            return {
                ...state,
                trace,
                openStreamIndex: null,
            };
        }
    }
    const newItem: TraceToolItem = {
        type: "tool",
        toolCallId,
        title: toolDisplayTitle(kind, title),
        kind,
        subtitle,
        status: status ?? "pending",
        content: undefined,
        diffRows: undefined,
        detailVisible: false,
    };
    const trace = [...state.trace, newItem];
    const toolIndexById = new Map(state.toolIndexById);
    toolIndexById.set(toolCallId, trace.length - 1);
    return {
        ...state,
        trace,
        toolIndexById,
        openStreamIndex: null,
    };
}

function updateToolCall(
    state: ChatState,
    toolCallId: string,
    status: ToolCallStatus,
    content: string | undefined,
    subtitle: string | undefined,
    diffRows: ToolCallDiffRow[] | undefined,
    kind: string | undefined,
): ChatState {
    const idx = state.toolIndexById.get(toolCallId);
    if (idx !== undefined) {
        const item = state.trace[idx];
        if (item?.type !== "tool") {
            return state;
        }
        const mergedContent = content !== undefined ? content : item.content;
        const mergedDiffRows =
            diffRows !== undefined && diffRows.length > 0
                ? diffRows
                : item.diffRows;
        const detailVisible =
            (mergedContent !== undefined && mergedContent.trim().length > 0) ||
            (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
        const mergedSubtitle =
            subtitle !== undefined && subtitle.trim().length > 0
                ? subtitle.trim()
                : item.subtitle;
        const mergedKind =
            kind !== undefined && kind.trim().length > 0
                ? kind.trim()
                : item.kind;
        const inferredKind =
            mergedKind ??
            (mergedDiffRows !== undefined && mergedDiffRows.length > 0
                ? "edit"
                : undefined);
        const mergedTitle = toolDisplayTitle(inferredKind, item.title);
        const trace = state.trace.slice();
        trace[idx] = {
            ...item,
            status,
            content: mergedContent,
            diffRows: mergedDiffRows,
            detailVisible,
            subtitle: mergedSubtitle,
            kind: inferredKind,
            title: mergedTitle,
        };
        return { ...state, trace };
    }
    const mergedContent = content;
    const mergedDiffRows =
        diffRows !== undefined && diffRows.length > 0 ? diffRows : undefined;
    const detailVisible =
        (mergedContent !== undefined && mergedContent.trim().length > 0) ||
        (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
    const inferredKind =
        kind !== undefined && kind.trim().length > 0
            ? kind.trim()
            : mergedDiffRows !== undefined && mergedDiffRows.length > 0
              ? "edit"
              : undefined;
    const newItem: TraceToolItem = {
        type: "tool",
        toolCallId,
        title: toolDisplayTitle(inferredKind, ""),
        kind: inferredKind,
        subtitle:
            subtitle !== undefined && subtitle.trim().length > 0
                ? subtitle.trim()
                : undefined,
        status,
        content: mergedContent,
        diffRows: mergedDiffRows,
        detailVisible,
    };
    const trace = [...state.trace, newItem];
    const toolIndexById = new Map(state.toolIndexById);
    toolIndexById.set(toolCallId, trace.length - 1);
    return {
        ...state,
        trace,
        toolIndexById,
        openStreamIndex: null,
    };
}

/**
 * Applies extension protocol messages and local submit actions to chat UI state.
 */
function applySessionReset(state: ChatState): ChatState {
    return {
        ...state,
        trace: [],
        openStreamIndex: null,
        toolIndexById: new Map(),
        promptInFlight: false,
        errorText: null,
        permissionPrompt: null,
        askQuestionPrompt: null,
        createPlanPrompt: null,
        sessionConfigOptions: null,
        modelSelection: null,
        sessionConfigLoading: true,
    };
}

function todoStatusEmoji(status: TodoEntry["status"]): string {
    if (status === "completed") {
        return "x";
    }
    if (status === "in_progress") {
        return "~";
    }
    if (status === "cancelled") {
        return "-";
    }
    return " ";
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
    if (action.type === "submit") {
        return {
            ...state,
            trace: [...state.trace, { type: "user", text: action.body }],
            promptInFlight: true,
            errorText: null,
            openStreamIndex: null,
            toolIndexById: new Map(),
            composerPicksLocked:
                state.lockSessionAgent === true
                    ? state.composerPicksLocked
                    : true,
        };
    }
    if (action.type === "pickSessionModel") {
        if (state.composerPicksLocked || state.modelSelection === null) {
            return state;
        }
        if (state.sessionConfigOptions !== null) {
            const modelOption = modelConfigOption({
                options: state.sessionConfigOptions,
            });
            if (modelOption !== undefined) {
                const cached = readCachedModelParamOptions(
                    agentNameFromState(state),
                    modelParamCacheKey(action.modelId, modelOption),
                );
                return applySessionConfigOptions(
                    state,
                    resolvedModelParamOptionsForModelPick(
                        state.sessionConfigOptions,
                        modelOption.configId,
                        action.modelId,
                        cached,
                    ),
                );
            }
        }
        return {
            ...state,
            modelSelection: {
                ...state.modelSelection,
                currentModelId: action.modelId,
            },
        };
    }
    if (action.type === "pickSessionConfigOption") {
        if (state.composerPicksLocked || state.sessionConfigOptions === null) {
            return state;
        }
        const isModelPick = isModelConfigPick(
            state.sessionConfigOptions,
            action.configId,
        );
        if (
            isModelPick &&
            typeof action.value === "string" &&
            action.value.length > 0
        ) {
            const modelOption = modelConfigOption({
                options: state.sessionConfigOptions,
            });
            const cached = readCachedModelParamOptions(
                agentNameFromState(state),
                modelParamCacheKey(action.value, modelOption),
            );
            return applySessionConfigOptions(
                state,
                resolvedModelParamOptionsForModelPick(
                    state.sessionConfigOptions,
                    action.configId,
                    action.value,
                    cached,
                ),
            );
        }
        const nextOptions = state.sessionConfigOptions.map((option) => {
            if (option.configId !== action.configId) {
                return option;
            }
            if (option.type === "boolean") {
                return {
                    ...option,
                    currentValue:
                        typeof action.value === "boolean"
                            ? action.value
                            : action.value === "true",
                };
            }
            return {
                ...option,
                currentValue:
                    typeof action.value === "string" ? action.value : option.currentValue,
            };
        });
        return applySessionConfigOptions(state, nextOptions);
    }
    if (action.type === "clearPermissionPrompt") {
        return { ...state, permissionPrompt: null };
    }
    if (action.type === "clearAskQuestionPrompt") {
        return { ...state, askQuestionPrompt: null };
    }
    if (action.type === "clearCreatePlanPrompt") {
        return { ...state, createPlanPrompt: null };
    }
    switch (action.type) {
        case "sessionReset":
            return applySessionReset(state);
        case "sessionModels": {
            const modelSelection = {
                currentModelId: action.currentModelId,
                availableModels: action.availableModels,
            };
            const agentName = agentNameFromState(state);
            if (agentName.length > 0) {
                writeCachedSessionModels(agentName, modelSelection);
            }
            return {
                ...state,
                modelSelection,
                sessionConfigLoading: false,
            };
        }
        case "sessionConfigOptions":
            return applySessionConfigOptions(state, action.options);
        case "sessionConfigOptionsLoading":
            return applySessionConfigOptionsLoading(state);
        case "acpAgentSelection":
            return {
                ...state,
                acpAgentSelection: {
                    currentName: action.currentAgentName,
                    availableNames: action.availableAgentNames,
                },
            };
        case "appendAgentText":
            return appendAgentText(state, action.text);
        case "appendUserText":
            return appendUserText(state, action.text);
        case "appendAgentThought":
            return appendAgentThought(state, action.text, action.durationMs);
        case "appendToolCall":
            return appendToolCall(
                state,
                action.toolCallId,
                action.title,
                action.kind,
                action.status,
                action.subtitle,
            );
        case "updateToolCall":
            return updateToolCall(
                state,
                action.toolCallId,
                action.status,
                action.content,
                action.subtitle,
                action.diffRows,
                action.kind,
            );
        case "slashCommands":
            return { ...state, slashCommands: action.commands };
        case "permissionRequest":
            return {
                ...state,
                permissionPrompt: {
                    requestId: action.requestId,
                    toolTitle: action.toolTitle,
                    options: action.options,
                },
            };
        case "cursorAskQuestionRequest":
            return { ...state, askQuestionPrompt: action };
        case "cursorCreatePlanRequest":
            return { ...state, createPlanPrompt: action };
        case "cursorUpdateTodos": {
            const trace = [
                ...state.trace,
                {
                    type: "plan" as const,
                    entries: action.todos.map((todo) => ({
                        content: `[${todoStatusEmoji(todo.status)}] ${todo.content}`,
                        status: todo.status,
                    })),
                },
            ];
            return { ...state, trace, openStreamIndex: null };
        }
        case "cursorTask": {
            const taskLine = `Subagent task: ${action.description}`;
            const trace = [...state.trace, { type: "agent" as const, text: taskLine }];
            return { ...state, trace, openStreamIndex: trace.length - 1 };
        }
        case "cursorGenerateImage": {
            const text =
                action.filePath !== undefined
                    ? `Generated image: ${action.filePath}`
                    : `Generate image requested: ${action.description}`;
            const trace = [...state.trace, { type: "agent" as const, text }];
            return { ...state, trace, openStreamIndex: trace.length - 1 };
        }
        case "appendPlan": {
            const trace = [
                ...state.trace,
                { type: "plan" as const, entries: action.entries },
            ];
            return {
                ...state,
                trace,
                openStreamIndex: null,
            };
        }
        case "commandFeedback": {
            const trace = [...state.trace, { type: "agent" as const, text: action.message }];
            return {
                ...state,
                trace,
                openStreamIndex: trace.length - 1,
                promptInFlight: false,
                errorText: null,
            };
        }
        case "turnComplete":
            return {
                ...state,
                openStreamIndex: null,
                promptInFlight: false,
            };
        case "error":
            return {
                ...state,
                openStreamIndex: null,
                errorText: action.message,
                promptInFlight: false,
            };
        default:
            return state;
    }
}

/**
 * Replays persisted session log events onto the initial state from `init`.
 */
export function replayChatState(
    init: InitPayload,
    events: Array<
        ExtensionMessageAfterInit | { type: "submit"; body: string }
    >,
): ChatState {
    let state = createChatStateFromInit(init);
    for (const event of events) {
        state = chatReducer(state, event as ChatAction);
    }
    return state;
}
