import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";
import "./ChatComposer.css";
import {
  buildModelPickerState,
  formatModelDisplayName,
  parseModelIdBracketParams,
  pickVariantForGroup,
} from "../../../../src/acp/session/modelVariantPicker";
import type { AcpUiSessionModelSelection } from "../../../../src/acp/session/sessionModels";
import {
  groupedModelChoices,
  modelConfigOption,
  modelParameterOptions,
  pickModelOptionForFamily,
} from "../../../../src/acp/session/sessionConfigOptions";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import type { AcpUiSlashCommand } from "../../../../src/protocol/extensionHostMessages";
import { buildComposerAutocompleteState, wrapIndex } from "./composerAutocomplete";
import { ModelConfigPopover } from "./ModelConfigPopover";

export type ChatComposerProps = {
  activityLabel: string | null;
  /** Shown in the activity slot when nothing is in flight (e.g. workspace cwd). */
  workspacePathHint: string;
  modelSelection: AcpUiSessionModelSelection | null;
  sessionConfigOptions: AcpUiSessionConfigOption[] | null;
  /** When true, model is shown as a label (standalone: after the first message). */
  modelPickerLocked: boolean;
  promptInFlight: boolean;
  /** When set, blocks the textarea (e.g. pending permission dialog). */
  inputBlocked: boolean;
  slashCommands: AcpUiSlashCommand[];
  workspaceFiles: string[];
  suggestionIndex: number;
  /** When true, hide autocomplete until the draft changes. */
  autocompleteDismissed: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onPickSessionModel: (modelId: string) => void;
  onPickSessionConfigOption: (
    configId: string,
    value: string | boolean,
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Focus target after external inserts (e.g. file drop). */
  composerInputRef?: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Activity hint, optional model picker, message input, and send/cancel actions.
 */
export function ChatComposer({
  activityLabel,
  workspacePathHint,
  modelSelection,
  sessionConfigOptions,
  modelPickerLocked,
  promptInFlight,
  inputBlocked,
  slashCommands,
  workspaceFiles,
  suggestionIndex,
  autocompleteDismissed,
  draft,
  onDraftChange,
  onPickSessionModel,
  onPickSessionConfigOption,
  onSubmit,
  onCancel,
  onKeyDown,
  composerInputRef,
}: ChatComposerProps): ReactElement {
  const textareaDisabled = inputBlocked;
  const autocomplete = useMemo(() => {
    const caret = draft.length;
    return buildComposerAutocompleteState({
      draft,
      caret,
      slashCommands,
      workspaceFiles,
    });
  }, [draft, slashCommands, workspaceFiles]);
  const activeIndex =
    autocomplete !== null
      ? wrapIndex(suggestionIndex, autocomplete.items.length)
      : 0;
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, autocomplete?.items.length]);
  const configModelOption = useMemo(
    () =>
      modelConfigOption(
        sessionConfigOptions !== null
          ? { options: sessionConfigOptions }
          : null,
      ),
    [sessionConfigOptions],
  );
  const configModelGroups = useMemo(
    () =>
      configModelOption !== undefined
        ? groupedModelChoices(configModelOption)
        : [],
    [configModelOption],
  );
  const configParamOptions = useMemo(
    () =>
      modelParameterOptions(
        sessionConfigOptions !== null
          ? { options: sessionConfigOptions }
          : null,
      ),
    [sessionConfigOptions],
  );
  const useConfigModelPicker = configModelOption !== undefined;
  const modelSel = modelSelection;
  const modelReady =
    useConfigModelPicker ||
    (modelSel !== null && modelSel.availableModels.length > 0);
  const modelSelectDisabled =
    modelPickerLocked || textareaDisabled || !modelReady;
  const modelPickerState = useMemo(() => {
    if (useConfigModelPicker || !modelReady || modelSel === null) {
      return null;
    }
    return buildModelPickerState(
      modelSel.availableModels,
      modelSel.currentModelId,
    );
  }, [useConfigModelPicker, modelReady, modelSel]);
  const configCurrentGroupName = useMemo(() => {
    if (configModelOption === undefined) {
      return "";
    }
    const currentChoice = configModelOption.options.find(
      (choice) => choice.value === configModelOption.currentValue,
    );
    if (currentChoice !== undefined) {
      return currentChoice.name;
    }
    return parseModelIdBracketParams(configModelOption.currentValue).base;
  }, [configModelOption]);
  const modelLabel = useConfigModelPicker
    ? formatModelDisplayName(
        configCurrentGroupName,
        configModelOption?.currentValue ?? "",
      )
    : (modelPickerState?.currentGroupLabel ?? "");

  const inflight =
    activityLabel !== null && activityLabel.length > 0;
  const activityDisplay = inflight ? activityLabel : workspacePathHint;
  return (
    <footer className="composer-frame">
      <div className="composer-top-bar">
        <div
          className={
            inflight
              ? "composer-activity composer-activity--inflight"
              : "composer-activity"
          }
          role="status"
          aria-live="polite"
          title={inflight ? undefined : workspacePathHint}
        >
          {activityDisplay}
        </div>
        <div className="composer-top-bar-right">
          <span className="composer-inline-label">Model</span>
          {modelPickerLocked ? (
            <>
              <span
                className="composer-pick-value"
                title={modelLabel}
                aria-label={`Model: ${modelLabel}`}
              >
                {modelLabel.length > 0 ? modelLabel : "\u2014"}
              </span>
            </>
          ) : (
            <>
              {useConfigModelPicker && configModelOption !== undefined ? (
                <select
                  id="acp-ui-model-select"
                  className="composer-model-select"
                  aria-label="Model"
                  value={configCurrentGroupName}
                  disabled={modelSelectDisabled}
                  onChange={(e) => {
                    const preferredParams = parseModelIdBracketParams(
                      configModelOption.currentValue,
                    ).params;
                    const nextModelId = pickModelOptionForFamily(
                      configModelOption,
                      e.target.value,
                      preferredParams,
                    );
                    onPickSessionConfigOption(
                      configModelOption.configId,
                      nextModelId,
                    );
                  }}
                >
                  {configModelGroups.map((group) => (
                    <option key={group.name} value={group.name}>
                      {group.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="acp-ui-model-select"
                  className="composer-model-select"
                  aria-label="Model"
                  value={modelPickerState?.currentGroupName ?? ""}
                  disabled={modelSelectDisabled}
                  onChange={(e) => {
                    if (modelSel === null || modelPickerState === null) {
                      return;
                    }
                    const group = modelPickerState.groups.find(
                      (entry) => entry.name === e.target.value,
                    );
                    if (group === undefined || group.variants.length === 0) {
                      return;
                    }
                    const preferredParams = parseModelIdBracketParams(
                      modelSel.currentModelId,
                    ).params;
                    const variants = group.variants.map((variant) => ({
                      modelId: variant.modelId,
                      params: parseModelIdBracketParams(variant.modelId).params,
                    }));
                    onPickSessionModel(
                      pickVariantForGroup(variants, preferredParams),
                    );
                  }}
                >
                  {modelPickerState !== null ? (
                    modelPickerState.groups.map((group) => (
                      <option key={group.name} value={group.name}>
                        {group.label}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {"\u2014"}
                    </option>
                  )}
                </select>
              )}
              {configParamOptions.length > 0 ? (
                <ModelConfigPopover
                  options={configParamOptions}
                  disabled={modelSelectDisabled}
                  onPick={onPickSessionConfigOption}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="composer-input-wrap">
        {autocomplete !== null && !autocompleteDismissed ? (
          <div
            className="composer-slash-menu"
            role="listbox"
            aria-label={
              autocomplete.mode === "slash" ? "Slash commands" : "Workspace files"
            }
          >
            {autocomplete.items.map((item, index) => (
              <button
                key={item.key}
                ref={index === activeIndex ? activeItemRef : undefined}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "composer-slash-item composer-slash-item--active"
                    : "composer-slash-item"
                }
                onClick={() => {
                  onDraftChange(
                    draft.replace(
                      /(?:^|\s)(?:\/[^\s]*|@[^\s]*)$/,
                      (match) =>
                        `${match.startsWith(" ") ? " " : ""}${item.insertText.trimEnd()}`,
                    ),
                  );
                }}
              >
                <span className="composer-slash-name">{item.primary}</span>
                {item.secondary !== undefined && item.secondary.length > 0 ? (
                  <span className="composer-slash-desc">{item.secondary}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={composerInputRef}
          className="composer-input"
          placeholder="Describe a task for the agent to do..."
          aria-label="Agent input"
          title="Enter to send. Shift+Enter for newline. Arrow up and down for prompt history."
          rows={2}
          value={draft}
          disabled={textareaDisabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="composer-footer">
        <span className="composer-footer-hint-left">
          / commands · @ files (Hold shift to drop)
        </span>
        <button
          type="button"
          className="composer-cancel"
          disabled={!promptInFlight}
          onClick={() => onCancel()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="composer-send"
          disabled={textareaDisabled}
          onClick={() => onSubmit()}
        >
          Send
        </button>
      </div>
    </footer>
  );
}
