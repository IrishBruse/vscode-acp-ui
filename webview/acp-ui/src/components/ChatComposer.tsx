import {
  Fragment,
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
  modeConfigOption,
  modelConfigOption,
  modelParameterOptions,
  pickModelOptionForFamily,
  resolveDerivedModelParamPick,
  resolveModelSelectOption,
  isDerivedConfigId,
  usesAgentOrderedConfigLayout,
  configOptionsSummaryLabel,
} from "../../../../src/acp/session/sessionConfigOptions";
import type { AcpUiSessionConfigOption } from "../../../../src/acp/session/sessionConfigOptions";
import { isSessionModeConfigOption, resolveComposerPlaceholder } from "../../../../src/acp/session/sessionModeIndicator";
import type { AcpUiSlashCommand } from "../../../../src/protocol/extensionHostMessages";
import { buildComposerAutocompleteState, wrapIndex } from "./composerAutocomplete";
import { ConfigOptionControls, ComposerConfigLoading } from "./ConfigOptionControls";
import { SessionModeIndicator } from "./SessionModeIndicator";

export type ChatComposerProps = {
  activityLabel: string | null;
  /** Shown in the activity slot when nothing is in flight (e.g. workspace cwd). */
  workspacePathHint: string;
  modelSelection: AcpUiSessionModelSelection | null;
  sessionConfigOptions: AcpUiSessionConfigOption[] | null;
  sessionConfigLoading: boolean;
  /** When true, model is shown as a label (standalone: after the first message). */
  modelPickerLocked: boolean;
  /** Hides model/config dropdowns in the composer footer. */
  hideComposerModelControls: boolean;
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
  sessionConfigLoading,
  modelPickerLocked,
  hideComposerModelControls,
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
  const configState = useMemo(
    () =>
      sessionConfigOptions !== null
        ? { options: sessionConfigOptions }
        : null,
    [sessionConfigOptions],
  );
  const modeOption = useMemo(
    () => modeConfigOption(configState),
    [configState],
  );
  const composerPlaceholder = useMemo(
    () => resolveComposerPlaceholder(modeOption?.currentValue ?? ""),
    [modeOption],
  );
  const toolbarConfigOptions = useMemo(
    () =>
      sessionConfigOptions !== null
        ? sessionConfigOptions.filter(
            (option) => !isSessionModeConfigOption(option),
          )
        : null,
    [sessionConfigOptions],
  );
  const agentOrderedLayout = usesAgentOrderedConfigLayout(configState);
  const configModelOption = useMemo(
    () => modelConfigOption(configState),
    [configState],
  );
  const configModelGroups = useMemo(
    () =>
      configModelOption !== undefined
        ? groupedModelChoices(configModelOption)
        : [],
    [configModelOption],
  );
  const configParamOptions = useMemo(
    () => modelParameterOptions(configState, modelSelection),
    [configState, modelSelection],
  );
  const resolvedModelOption = useMemo(
    () => resolveModelSelectOption(configState, modelSelection),
    [configState, modelSelection],
  );
  const useLegacyModelPath = configModelOption === undefined;
  const useConfigModelPicker =
    configModelOption !== undefined && !agentOrderedLayout;
  const modelSel = modelSelection;
  const showConfigLoading = !modelPickerLocked && sessionConfigLoading;
  const modelReady =
    agentOrderedLayout ||
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
  const modelLabel = agentOrderedLayout
    ? configOptionsSummaryLabel(sessionConfigOptions ?? [])
    : useConfigModelPicker
      ? formatModelDisplayName(
          configCurrentGroupName,
          configModelOption?.currentValue ?? "",
        )
      : (modelPickerState?.currentGroupLabel ?? "");

  const handleModelParamPick = (
    configId: string,
    value: string | boolean,
  ): void => {
    if (
      resolvedModelOption !== undefined &&
      isDerivedConfigId(configId)
    ) {
      const nextModelId = resolveDerivedModelParamPick(
        resolvedModelOption,
        configId,
        value,
      );
      if (nextModelId === null) {
        return;
      }
      if (useLegacyModelPath) {
        onPickSessionModel(nextModelId);
        return;
      }
      onPickSessionConfigOption(
        resolvedModelOption.configId,
        nextModelId,
      );
      return;
    }
    onPickSessionConfigOption(configId, value);
  };

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
        <span className="composer-top-bar-hint">/ commands · @ files</span>
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
            {(() => {
              let itemIndex = 0;
              return autocomplete.groups.map((group) => (
                <Fragment key={group.label ?? "built-in"}>
                  {group.label !== undefined ? (
                    <div
                      className="composer-slash-group"
                      role="presentation"
                      aria-hidden="true"
                    >
                      {group.label}
                    </div>
                  ) : null}
                  {group.items.map((item) => {
                    const index = itemIndex;
                    itemIndex += 1;
                    return (
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
                        {item.secondary !== undefined &&
                        item.secondary.length > 0 ? (
                          <span className="composer-slash-desc">
                            {item.secondary}
                          </span>
                        ) : null}
                        {item.source !== undefined && item.source.length > 0 ? (
                          <span className="composer-slash-source">
                            {item.source}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </Fragment>
              ));
            })()}
          </div>
        ) : null}
        <textarea
          ref={composerInputRef}
          className="composer-input"
          placeholder={composerPlaceholder}
          aria-label="Agent input"
          title="Enter to send. Shift+Enter for newline. Shift+Tab to cycle mode. Arrow up and down for prompt history."
          rows={2}
          value={draft}
          disabled={textareaDisabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="composer-footer">
        {hideComposerModelControls ? null : (
        <div
          className={
            agentOrderedLayout
              ? "composer-footer-model composer-footer-config"
              : "composer-footer-model composer-footer-model--stacked"
          }
        >
          {modelPickerLocked ? (
            <span
              className="composer-pick-value"
              title={modelLabel}
              aria-label={
                agentOrderedLayout
                  ? `Session config: ${modelLabel}`
                  : `Model: ${modelLabel}`
              }
            >
              {modelLabel.length > 0 ? modelLabel : "\u2014"}
            </span>
          ) : showConfigLoading ? (
            <ComposerConfigLoading />
          ) : agentOrderedLayout && toolbarConfigOptions !== null ? (
            <ConfigOptionControls
              options={toolbarConfigOptions}
              disabled={modelSelectDisabled}
              onPick={onPickSessionConfigOption}
            />
          ) : (
            <>
              {useConfigModelPicker && configModelOption !== undefined ? (
                <div className="composer-config-field">
                  <label
                    className="composer-config-label"
                    htmlFor="acp-ui-model-select"
                  >
                    Model
                  </label>
                  <select
                    id="acp-ui-model-select"
                    className="composer-config-select composer-config-select--model"
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
                </div>
              ) : (
                <div className="composer-config-field">
                  <label
                    className="composer-config-label"
                    htmlFor="acp-ui-model-select"
                  >
                    Model
                  </label>
                  <select
                    id="acp-ui-model-select"
                    className="composer-config-select composer-config-select--model"
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
                        params: parseModelIdBracketParams(variant.modelId)
                          .params,
                      }));
                      onPickSessionModel(
                        pickVariantForGroup(variants, preferredParams),
                      );
                    }}
                  >
                    {modelPickerState?.groups.map((group) => (
                      <option key={group.name} value={group.name}>
                        {group.label}
                      </option>
                    )) ?? null}
                  </select>
                </div>
              )}
              {configParamOptions.length > 0 ? (
                <ConfigOptionControls
                  options={configParamOptions}
                  disabled={modelSelectDisabled}
                  onPick={handleModelParamPick}
                />
              ) : null}
            </>
          )}
        </div>
        )}
        <div className="composer-mode-slot">
          <SessionModeIndicator modeOption={modeOption} />
        </div>
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
