import "./AcpUiApp.css";
import "./scrollRegions.css";
import {
  Fragment,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { cycleSessionModePick } from "../../../src/acp/session/sessionConfigOptions";
import type {
  AcpUiSlashCommand,
  ToolCallVerbosity,
} from "../../../src/protocol/extensionHostMessages";
import {
  type ChatAction,
  chatReducer,
  createChatStateFromInit,
  type ChatState,
  type ExtensionMessageAfterInit,
  type InitPayload,
  type TraceItem,
} from "./chatReducer";
import { ChatComposer } from "./components/ChatComposer";
import { installSessionModeIndicatorThemeColors } from "./sessionModeIndicatorTheme";
import {
    installAgentMarkdownThemeColors,
    updateAgentMarkdownThemeColors,
} from "./agentMarkdownTheme";
import {
  buildComposerAutocompleteState,
  wrapIndex,
} from "./components/composerAutocomplete";
import {
  shouldCancelRunOnCtrlC,
  shouldCycleSessionModeOnShiftTab,
  shouldOpenNewChatOnCtrlT,
} from "./components/composerKeybindings";
import { CursorAskQuestionDialog } from "./components/CursorAskQuestionDialog";
import { CursorCreatePlanDialog } from "./components/CursorCreatePlanDialog";
import { PermissionDialog } from "./components/PermissionDialog";
import { TraceList } from "./components/TraceList";
import { SessionHistoryLoader } from "./components/SessionHistoryLoader";
import {
  appendFileMentionsToDraft,
  collectPathsFromDataTransfer,
  dataTransferLooksLikePathDrop,
} from "./droppedFilePaths";

export type AcpUiAppProps = {
  init: InitPayload;
  initialChatState?: ChatState;
  postSend: (body: string) => void;
  postCancel: () => void;
  postRenameSession: (title: string) => void;
  postResetSession: () => void;
  postSetSessionModel: (modelId: string) => void;
  postSetSessionConfigOption: (
    configId: string,
    value: string | boolean,
  ) => void;
  postSavePromptHistory: (entries: string[]) => void;
  postOpenNewChat?: () => void;
  postPermissionResponse: (
    payload:
      | { requestId: string; selectedOptionId: string }
      | { requestId: string; cancelled: true },
  ) => void;
  postCursorAskQuestionResponse: (payload: {
    requestId: string;
    outcome:
      | {
          outcome: "answered";
          answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
        }
      | { outcome: "skipped"; reason?: string }
      | { outcome: "cancelled" };
  }) => void;
  postCursorCreatePlanResponse: (payload: {
    requestId: string;
    outcome:
      | { outcome: "accepted"; planUri?: string }
      | { outcome: "rejected"; reason?: string }
      | { outcome: "cancelled" };
  }) => void;
  extensionDispatchRef: RefObject<
    ((message: ExtensionMessageAfterInit) => void) | null
  >;
};

/**
 * ACP UI editor webview: header, transcript, composer, and protocol-driven transcript updates.
 */
export function AcpUiApp({
  init,
  initialChatState,
  postSend,
  postCancel,
  postRenameSession,
  postResetSession,
  postSetSessionModel,
  postSetSessionConfigOption,
  postSavePromptHistory,
  postOpenNewChat,
  postPermissionResponse,
  postCursorAskQuestionResponse,
  postCursorCreatePlanResponse,
  extensionDispatchRef,
}: AcpUiAppProps): ReactElement {
  const [state, dispatch] = useReducer(
    chatReducer,
    { init, initialChatState },
    ({ init: initPayload, initialChatState: replayed }) =>
      replayed ?? createChatStateFromInit(initPayload),
  );
  const [draft, setDraft] = useState("");
  const [promptHistory, setPromptHistory] = useState<string[]>(
    init.promptHistory ?? [],
  );
  const [promptHistoryBrowse, setPromptHistoryBrowse] = useState<{
    pointer: number;
    restore: string;
  } | null>(null);
  const [expandAllToolOutputs, setExpandAllToolOutputs] = useState(false);
  const [showThinkingBlocks, setShowThinkingBlocks] = useState(true);
  const [toolCallVerbosity, setToolCallVerbosity] = useState<ToolCallVerbosity>(
    init.toolCallVerbosity ?? "verbose",
  );
  const traceRef = useRef<HTMLElement | null>(null);
  const traceContentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [composerSuggestionIndex, setComposerSuggestionIndex] = useState(0);
  const [composerAutocompleteDismissed, setComposerAutocompleteDismissed] =
    useState(false);

  const scrollTraceToBottomIfPinned = useCallback((): void => {
    const el = traceRef.current;
    if (el !== null && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const onTraceScroll = useCallback((): void => {
    const el = traceRef.current;
    if (el === null) {
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 48;
  }, []);

  extensionDispatchRef.current = (message: ExtensionMessageAfterInit) => {
    if (message.type === "vscodeThemeVariables") {
      updateAgentMarkdownThemeColors(message.variables);
      return;
    }
    if (message.type === "toolCallVerbosity") {
      setToolCallVerbosity(message.verbosity);
      return;
    }
    dispatch(message as ChatAction);
  };

  useLayoutEffect(() => {
    const cleanup = installAgentMarkdownThemeColors(init.vscodeThemeVariables);
    return cleanup;
  }, [init]);

  useLayoutEffect(() => installSessionModeIndicatorThemeColors(), []);

  useLayoutEffect(() => {
    scrollTraceToBottomIfPinned();
  }, [state.trace, scrollTraceToBottomIfPinned]);

  useEffect(() => {
    const content = traceContentRef.current;
    if (content === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      scrollTraceToBottomIfPinned();
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [scrollTraceToBottomIfPinned]);

  useEffect(() => {
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (shouldOpenNewChatOnCtrlT(event)) {
        if (postOpenNewChat !== undefined) {
          event.preventDefault();
          postOpenNewChat();
        }
        return;
      }
      if (
        event.key.toLowerCase() !== "o" ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      const target = event.target;
      if (
        target !== null &&
        target instanceof HTMLElement &&
        target.closest("textarea, input, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      setExpandAllToolOutputs((expanded) => !expanded);
    };
    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [postOpenNewChat]);

  const dropFilesDisabled =
    state.promptInFlight ||
    state.permissionPrompt !== null ||
    state.askQuestionPrompt !== null ||
    state.createPlanPrompt !== null;

  useEffect(() => {
    if (!fileDragActive) {
      return;
    }
    const endDragUi = (): void => {
      setFileDragActive(false);
    };
    window.addEventListener("dragend", endDragUi);
    return () => {
      window.removeEventListener("dragend", endDragUi);
    };
  }, [fileDragActive]);

  const workspaceText =
    init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
      ? init.workspaceLabel
      : "No workspace folder open";

  const activityLabel = useMemo(
    () =>
      composerActivityLabel(
        state.promptInFlight,
        state.trace,
        state.openStreamIndex,
      ),
    [state.promptInFlight, state.trace, state.openStreamIndex],
  );

  const builtInSlashCommands = useMemo((): AcpUiSlashCommand[] => {
    return [
      {
        name: "clear",
        description: "Clear the transcript and start a fresh agent session",
      },
      {
        name: "new",
        description: "Same as /clear — new session, empty transcript",
      },
      {
        name: "rename",
        description: "Rename the current chat (usage: /rename <new-name>)",
      },
      {
        name: "show-thinking",
        description: "Toggle visibility of thought blocks",
      },
    ];
  }, []);

  const mergedSlashCommands = useMemo(() => {
    const seen = new Set<string>();
    const out: AcpUiSlashCommand[] = [];
    for (const cmd of [...builtInSlashCommands, ...state.slashCommands]) {
      const key = cmd.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(cmd);
    }
    return out;
  }, [builtInSlashCommands, state.slashCommands]);

  const onDraftChange = useCallback((value: string): void => {
    setDraft(value);
    setPromptHistoryBrowse((browse) => (browse !== null ? null : browse));
    setComposerSuggestionIndex(0);
    setComposerAutocompleteDismissed(false);
  }, []);

  const submit = (): void => {
    if (state.permissionPrompt !== null) {
      return;
    }
    const body = draft;
    if (body.trim().length === 0) {
      return;
    }
    const asCommand = body.toLowerCase();
    if (asCommand === "/clear" || asCommand === "/new") {
      setDraft("");
      setPromptHistoryBrowse(null);
      stickToBottomRef.current = true;
      dispatch({ type: "sessionReset" });
      postResetSession();
      return;
    }
    if (asCommand === "/show-thinking") {
      setDraft("");
      setPromptHistoryBrowse(null);
      setShowThinkingBlocks((value) => !value);
      dispatch({
        type: "commandFeedback",
        message: showThinkingBlocks
          ? "Thought blocks hidden."
          : "Thought blocks shown.",
      });
      return;
    }
    if (body.toLowerCase().startsWith("/rename")) {
      const match = body.match(/^\/rename\s+(\S+)$/i);
      if (match === null) {
        dispatch({
          type: "commandFeedback",
          message: "Usage: /rename <new-name>",
        });
        return;
      }
      const nextTitle = match[1]!;
      setDraft("");
      setPromptHistoryBrowse(null);
      postRenameSession(nextTitle);
      return;
    }
    setDraft("");
    setPromptHistoryBrowse(null);
    setPromptHistory((prev) => {
      const next =
        prev.length > 0 && prev[prev.length - 1] === body
          ? prev
          : [...prev.slice(-49), body];
      postSavePromptHistory(next);
      return next;
    });
    stickToBottomRef.current = true;
    dispatch({ type: "submit", body });
    postSend(body);
  };

  const onComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const mod =
      event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    const autocomplete = buildComposerAutocompleteState({
      draft,
      caret: start,
      slashCommands: mergedSlashCommands,
      workspaceFiles: init.workspaceFiles ?? [],
    });
    const autocompleteActive =
      autocomplete !== null && !composerAutocompleteDismissed;
    const hasSelection = start !== end;

    if (
      shouldCycleSessionModeOnShiftTab({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      }) &&
      !state.composerPicksLocked
    ) {
      const pick = cycleSessionModePick(
        state.sessionConfigOptions !== null
          ? { options: state.sessionConfigOptions }
          : null,
      );
      if (pick !== null) {
        event.preventDefault();
        dispatch({
          type: "pickSessionConfigOption",
          configId: pick.configId,
          value: pick.value,
        });
        postSetSessionConfigOption(pick.configId, pick.value);
        return;
      }
    }

    if (
      shouldCancelRunOnCtrlC({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        hasSelection,
        promptInFlight: state.promptInFlight,
      })
    ) {
      event.preventDefault();
      postCancel();
      return;
    }

    if (autocompleteActive && event.key === "Escape") {
      event.preventDefault();
      setComposerSuggestionIndex(0);
      setComposerAutocompleteDismissed(true);
      return;
    }

    if (
      autocompleteActive &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setComposerSuggestionIndex((current) =>
        wrapIndex(current + delta, autocomplete.items.length),
      );
      return;
    }

    if (autocompleteActive && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const nextIndex = wrapIndex(
        composerSuggestionIndex,
        autocomplete.items.length,
      );
      const selected = autocomplete.items[nextIndex];
      if (selected !== undefined) {
        const left = draft.slice(0, start);
        const lineStart = left.lastIndexOf("\n") + 1;
        const prefixToken = autocomplete.mode === "slash" ? "/" : "@";
        const tokenStart = left.lastIndexOf(prefixToken);
        if (tokenStart >= lineStart) {
          const right = draft.slice(start);
          const consumed = right.match(/^[^\s]*/)?.[0] ?? "";
          const nextDraft =
            draft.slice(0, tokenStart) + selected.insertText + right.slice(consumed.length);
          setDraft(nextDraft);
          setPromptHistoryBrowse(null);
          setComposerSuggestionIndex(0);
          return;
        }
      }
    }

    if (event.key === "ArrowUp" && !mod) {
      if (promptHistoryBrowse !== null) {
        event.preventDefault();
        if (promptHistoryBrowse.pointer > 0) {
          const nextPointer = promptHistoryBrowse.pointer - 1;
          setPromptHistoryBrowse({
            pointer: nextPointer,
            restore: promptHistoryBrowse.restore,
          });
          setDraft(promptHistory[nextPointer] ?? "");
        }
        return;
      }
      if (
        promptHistory.length > 0 &&
        textareaAtFirstLineFirstColumn(start, end)
      ) {
        event.preventDefault();
        const lastIdx = promptHistory.length - 1;
        setPromptHistoryBrowse({ pointer: lastIdx, restore: draft });
        setDraft(promptHistory[lastIdx] ?? "");
        return;
      }
    }

    if (event.key === "ArrowDown" && !mod && promptHistoryBrowse !== null) {
      event.preventDefault();
      if (promptHistoryBrowse.pointer < promptHistory.length - 1) {
        const nextPointer = promptHistoryBrowse.pointer + 1;
        setPromptHistoryBrowse({
          pointer: nextPointer,
          restore: promptHistoryBrowse.restore,
        });
        setDraft(promptHistory[nextPointer] ?? "");
      } else {
        setPromptHistoryBrowse(null);
        setDraft(promptHistoryBrowse.restore);
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (state.promptInFlight) {
        postCancel();
      }
      submit();
    }
  };

  const permission = state.permissionPrompt;
  const askQuestion = state.askQuestionPrompt;
  const createPlan = state.createPlanPrompt;

  const onShellDragEnterCapture = (event: DragEvent<HTMLDivElement>): void => {
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setFileDragActive(true);
  };

  const onShellDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    const next = event.relatedTarget as Node | null;
    if (next !== null && event.currentTarget.contains(next)) {
      return;
    }
    setFileDragActive(false);
  };

  const onShellDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onShellDrop = (event: DragEvent<HTMLDivElement>): void => {
    setFileDragActive(false);
    if (dropFilesDisabled || !dataTransferLooksLikePathDrop(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const root =
      init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
        ? init.workspaceLabel
        : undefined;
    const paths = collectPathsFromDataTransfer(event.dataTransfer, root);
    if (paths.length === 0) {
      return;
    }
    setDraft((d) => appendFileMentionsToDraft(d, paths, root));
    setPromptHistoryBrowse(null);
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  };

  return (
    <Fragment>
      <div
        className="acp-ui-error"
        role="alert"
        hidden={state.errorText === null}
      >
        {state.errorText}
      </div>
      <div
        className={
          fileDragActive
            ? "acp-ui-shell acp-ui-shell--file-drag"
            : "acp-ui-shell"
        }
        onDragEnterCapture={onShellDragEnterCapture}
        onDragLeave={onShellDragLeave}
        onDragOver={onShellDragOver}
        onDrop={onShellDrop}
      >
        <main
          ref={traceRef}
          className="agent-trace"
          role="log"
          aria-label="Conversation"
          onScroll={onTraceScroll}
        >
          <div ref={traceContentRef} className="acp-ui-content-column">
            {state.sessionHistoryLoading && state.trace.length === 0 ? (
              <SessionHistoryLoader />
            ) : null}
            <TraceList
              items={state.trace}
              showThoughts={showThinkingBlocks}
              expandAllToolOutputs={expandAllToolOutputs}
              toolCallVerbosity={toolCallVerbosity}
              onCollapseExpandAll={() => {
                setExpandAllToolOutputs(false);
              }}
            />
            {state.sessionHistoryLoading && state.trace.length > 0 ? (
              <SessionHistoryLoader inline />
            ) : null}
          </div>
        </main>
        <div className="acp-ui-composer-stack">
          <div className="acp-ui-content-column">
          {permission !== null ? (
            <PermissionDialog
              toolTitle={permission.toolTitle}
              options={permission.options}
              onSelect={(optionId) => {
                postPermissionResponse({
                  requestId: permission.requestId,
                  selectedOptionId: optionId,
                });
                dispatch({ type: "clearPermissionPrompt" });
              }}
              onDismiss={() => {
                postPermissionResponse({
                  requestId: permission.requestId,
                  cancelled: true,
                });
                dispatch({ type: "clearPermissionPrompt" });
              }}
            />
          ) : null}
          {askQuestion !== null ? (
            <CursorAskQuestionDialog
              request={askQuestion}
              onSubmit={(answers) => {
                postCursorAskQuestionResponse({
                  requestId: askQuestion.requestId,
                  outcome: { outcome: "answered", answers },
                });
                dispatch({ type: "clearAskQuestionPrompt" });
              }}
              onCancel={() => {
                postCursorAskQuestionResponse({
                  requestId: askQuestion.requestId,
                  outcome: { outcome: "cancelled" },
                });
                dispatch({ type: "clearAskQuestionPrompt" });
              }}
            />
          ) : null}
          {createPlan !== null ? (
            <CursorCreatePlanDialog
              request={createPlan}
              onAccept={() => {
                postCursorCreatePlanResponse({
                  requestId: createPlan.requestId,
                  outcome: { outcome: "accepted" },
                });
                dispatch({ type: "clearCreatePlanPrompt" });
              }}
              onReject={() => {
                postCursorCreatePlanResponse({
                  requestId: createPlan.requestId,
                  outcome: { outcome: "rejected" },
                });
                dispatch({ type: "clearCreatePlanPrompt" });
              }}
              onCancel={() => {
                postCursorCreatePlanResponse({
                  requestId: createPlan.requestId,
                  outcome: { outcome: "cancelled" },
                });
                dispatch({ type: "clearCreatePlanPrompt" });
              }}
            />
          ) : null}
          <ChatComposer
            activityLabel={activityLabel}
            workspacePathHint={workspaceText}
            modelSelection={state.modelSelection}
            sessionConfigOptions={state.sessionConfigOptions}
            sessionConfigLoading={state.sessionConfigLoading}
            modelPickerLocked={state.composerPicksLocked}
            hideComposerModelControls={state.hideComposerModelControls}
            promptInFlight={state.promptInFlight}
            inputBlocked={
              state.permissionPrompt !== null ||
              state.askQuestionPrompt !== null ||
              state.createPlanPrompt !== null
            }
            slashCommands={mergedSlashCommands}
            workspaceFiles={init.workspaceFiles ?? []}
            suggestionIndex={composerSuggestionIndex}
            autocompleteDismissed={composerAutocompleteDismissed}
            draft={draft}
            onDraftChange={onDraftChange}
            onPickSessionModel={(modelId) => {
              dispatch({ type: "pickSessionModel", modelId });
              postSetSessionModel(modelId);
            }}
            onPickSessionConfigOption={(configId, value) => {
              dispatch({ type: "pickSessionConfigOption", configId, value });
              postSetSessionConfigOption(configId, value);
            }}
            onSubmit={submit}
            onCancel={postCancel}
            onKeyDown={onComposerKeyDown}
            composerInputRef={composerTextareaRef}
          />
          </div>
        </div>
      </div>
    </Fragment>
  );
}

/**
 * Whether the caret is at the start of the first line (for recalling prompt history with ArrowUp).
 */
function textareaAtFirstLineFirstColumn(
  selectionStart: number,
  selectionEnd: number,
): boolean {
  if (selectionStart !== selectionEnd) {
    return false;
  }
  return selectionStart === 0;
}

/**
 * Short status line for the composer while a prompt is in flight (tool kind, generating, or thinking).
 */
function composerActivityLabel(
  promptInFlight: boolean,
  trace: TraceItem[],
  openStreamIndex: number | null,
): string | null {
  if (!promptInFlight) {
    return null;
  }
  for (let i = trace.length - 1; i >= 0; i--) {
    const item = trace[i];
    if (
      item?.type === "tool" &&
      (item.status === "pending" || item.status === "in_progress")
    ) {
      const k = item.kind?.toLowerCase();
      if (k === "read") {
        return "Reading…";
      }
      if (k === "edit") {
        return "Writing…";
      }
      if (k === "search") {
        return "Searching…";
      }
      if (k === "execute") {
        return "Running…";
      }
      const title = item.title.trim();
      return title.length > 0 ? `${title}…` : "Using tools…";
    }
  }
  if (openStreamIndex !== null) {
    const open = trace[openStreamIndex];
    if (open?.type === "agent") {
      return "Generating…";
    }
  }
  return "Thinking…";
}
