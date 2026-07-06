import type * as acp from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from "../../protocol/extensionHostMessages";
import type { AcpAgentSpawnConfig } from "../domain/agentSpawnConfig";
import { resolveAuthMethodId } from "../domain/agentSpawnConfig";
import { AcpAgentProcess } from "../infrastructure/acpAgentProcess";
import {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    sessionUpdateToWebviewMessages,
} from "../mapping/sessionUpdateMapping";
import type { AcpHostFilesystem } from "../ports/hostFilesystem";
import type { AcpRpcNdjsonSink } from "../ports/rpcNdjsonSink";
import { buildModelId, parseModelIdBracketParams } from "./modelVariantPicker";
import {
    type AcpUiSessionConfigOption,
    type AcpUiSessionConfigState,
    modelSelectOptionFromModels,
    resolveAdvertisedModelOptionValue,
    resolveModelConfigWireValue,
    sessionConfigOptionsFromAgent,
} from "./sessionConfigOptions";
import {
    readCachedComposerSeed,
    writeCachedSessionConfigOptions,
    writeCachedSessionModels,
} from "./sessionConfigOptionsCache";
import {
    type AcpUiSessionModelSelection,
    sessionModelStateToAcpUiSelection,
} from "./sessionModels";

/** Callback that forwards an extension-to-webview message to the UI host. */
export type PostToWebview = (message: ExtensionToWebviewMessage) => void;

/**
 * Host capabilities required to run an {@link AcpAgentProcess} (filesystem + RPC logging + workspace root).
 * Keeps the session bridge testable and independent of VS Code globals.
 */
export type AcpSessionHostRuntime = {
    hostFilesystem: AcpHostFilesystem;
    rpcNdjsonSink: AcpRpcNdjsonSink;
    getWorkspaceRoot: () => string | undefined;
};

export type AcpSessionBridgeHooks = {
    onSessionInfoUpdate?: (update: acp.SessionInfoUpdate) => void;
    /** Called immediately before `session/load` replays agent-side history. */
    onResumeSession?: () => void | Promise<void>;
    /** Called when `session/load` fails and the client falls back to `session/new`. */
    onLoadSessionFailed?: () => void | Promise<void>;
};

export type AcpSessionConnectOptions = {
    preferredModelId?: string;
    runtimeSessionId?: string;
};

/**
 * True when connect should call `session/load` instead of `session/new`.
 */
export function shouldLoadRuntimeSession(
    runtimeSessionId: string | undefined,
    supportsLoadSession: boolean,
): boolean {
    const id = runtimeSessionId?.trim();
    return id !== undefined && id.length > 0 && supportsLoadSession;
}

/**
 * Bridges a single chat session to an ACP agent process. Translates ACP session/update notifications
 * into host protocol messages and routes user prompts to the agent.
 */
export class AcpSessionBridge {
    private agentProcess: AcpAgentProcess;
    private acpSessionId: string | null = null;
    private prompting = false;
    private lastModelSelection: AcpUiSessionModelSelection | null = null;
    private lastConfigOptions: AcpUiSessionConfigState | null = null;
    private toolCallKindTracking = createToolCallKindTracking();
    private nextPermissionRequestId = 0;
    private permissionWaiters = new Map<
        string,
        (outcome: acp.RequestPermissionResponse) => void
    >();
    private nextCursorExtensionRequestId = 0;
    private askQuestionWaiters = new Map<
        string,
        (result: Record<string, unknown>) => void
    >();
    private createPlanWaiters = new Map<
        string,
        (result: Record<string, unknown>) => void
    >();

    constructor(
        private readonly config: AcpAgentSpawnConfig,
        private readonly postToWebview: PostToWebview,
        host: AcpSessionHostRuntime,
        private readonly hooks?: AcpSessionBridgeHooks,
    ) {
        this.agentProcess = new AcpAgentProcess({
            config,
            requestPermission: (params) => this.queuePermissionRequest(params),
            extMethod: (method, params) =>
                this.handleExtensionMethod(method, params),
            extNotification: (method, params) =>
                this.handleExtensionNotification(method, params),
            hostFilesystem: host.hostFilesystem,
            rpcNdjsonSink: host.rpcNdjsonSink,
            getWorkspaceRoot: host.getWorkspaceRoot,
        });
        this.agentProcess.onSessionUpdate((params) =>
            this.handleSessionUpdate(params),
        );
    }

    private async queuePermissionRequest(
        params: acp.RequestPermissionRequest,
    ): Promise<acp.RequestPermissionResponse> {
        const requestId = `perm-${this.nextPermissionRequestId++}`;
        return new Promise((resolve) => {
            this.permissionWaiters.set(requestId, resolve);
            for (const msg of extensionMessagesForPermissionRequest(
                requestId,
                params,
            )) {
                this.postToWebview(msg);
            }
        });
    }

    /**
     * Completes a pending `session/request_permission` from the UI (e.g. webview dialog).
     */
    handlePermissionResponse(
        message: Extract<
            WebviewToExtensionMessage,
            { type: "permissionResponse" }
        >,
    ): void {
        const resolve = this.permissionWaiters.get(message.requestId);
        if (resolve === undefined) {
            return;
        }
        this.permissionWaiters.delete(message.requestId);
        if ("cancelled" in message && message.cancelled === true) {
            resolve({ outcome: { outcome: "cancelled" } });
            return;
        }
        if ("selectedOptionId" in message) {
            resolve({
                outcome: {
                    outcome: "selected",
                    optionId: message.selectedOptionId,
                },
            });
        }
    }

    handleCursorAskQuestionResponse(
        message: Extract<
            WebviewToExtensionMessage,
            { type: "cursorAskQuestionResponse" }
        >,
    ): void {
        const resolve = this.askQuestionWaiters.get(message.requestId);
        if (resolve === undefined) {
            return;
        }
        this.askQuestionWaiters.delete(message.requestId);
        resolve({ outcome: message.outcome });
    }

    handleCursorCreatePlanResponse(
        message: Extract<
            WebviewToExtensionMessage,
            { type: "cursorCreatePlanResponse" }
        >,
    ): void {
        const resolve = this.createPlanWaiters.get(message.requestId);
        if (resolve === undefined) {
            return;
        }
        this.createPlanWaiters.delete(message.requestId);
        resolve({ outcome: message.outcome });
    }

    private cancelPendingPermissions(): void {
        for (const resolve of this.permissionWaiters.values()) {
            resolve({ outcome: { outcome: "cancelled" } });
        }
        this.permissionWaiters.clear();
    }

    private cancelPendingExtensionRequests(): void {
        for (const resolve of this.askQuestionWaiters.values()) {
            resolve({ outcome: { outcome: "cancelled" } });
        }
        this.askQuestionWaiters.clear();
        for (const resolve of this.createPlanWaiters.values()) {
            resolve({ outcome: { outcome: "cancelled" } });
        }
        this.createPlanWaiters.clear();
    }

    private nextCursorRequestId(prefix: string): string {
        const next = this.nextCursorExtensionRequestId++;
        return `${prefix}-${next}`;
    }

    private async handleExtensionMethod(
        method: string,
        params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        if (method === "cursor/ask_question") {
            const requestId = this.nextCursorRequestId("cursor-ask-question");
            const questionsRaw = params.questions;
            const questions = Array.isArray(questionsRaw)
                ? questionsRaw
                      .map((q) => {
                          if (q === null || typeof q !== "object") {
                              return null;
                          }
                          const record = q as Record<string, unknown>;
                          const id =
                              typeof record.id === "string"
                                  ? record.id.trim()
                                  : "";
                          const prompt =
                              typeof record.prompt === "string"
                                  ? record.prompt.trim()
                                  : "";
                          const optionsRaw = record.options;
                          const options = Array.isArray(optionsRaw)
                              ? optionsRaw
                                    .map((o) => {
                                        if (
                                            o === null ||
                                            typeof o !== "object"
                                        ) {
                                            return null;
                                        }
                                        const option = o as Record<
                                            string,
                                            unknown
                                        >;
                                        const optionId =
                                            typeof option.id === "string"
                                                ? option.id.trim()
                                                : "";
                                        const label =
                                            typeof option.label === "string"
                                                ? option.label.trim()
                                                : "";
                                        if (
                                            optionId.length === 0 ||
                                            label.length === 0
                                        ) {
                                            return null;
                                        }
                                        return { id: optionId, label };
                                    })
                                    .filter(
                                        (
                                            o,
                                        ): o is { id: string; label: string } =>
                                            o !== null,
                                    )
                              : [];
                          if (
                              id.length === 0 ||
                              prompt.length === 0 ||
                              options.length === 0
                          ) {
                              return null;
                          }
                          return {
                              id,
                              prompt,
                              options,
                              ...(record.allowMultiple === true
                                  ? { allowMultiple: true }
                                  : {}),
                          };
                      })
                      .filter((q): q is NonNullable<typeof q> => q !== null)
                : [];
            if (questions.length === 0) {
                return { outcome: { outcome: "cancelled" } };
            }
            this.postToWebview({
                type: "cursorAskQuestionRequest",
                requestId,
                ...(typeof params.title === "string" &&
                params.title.trim().length > 0
                    ? { title: params.title.trim() }
                    : {}),
                questions,
            });
            return await new Promise((resolve) => {
                this.askQuestionWaiters.set(requestId, resolve);
            });
        }
        if (method === "cursor/create_plan") {
            const requestId = this.nextCursorRequestId("cursor-create-plan");
            const plan =
                typeof params.plan === "string" ? params.plan.trim() : "";
            if (plan.length === 0) {
                return { outcome: { outcome: "cancelled" } };
            }
            const todos = Array.isArray(params.todos)
                ? (params.todos as unknown[])
                      .map((todo) => {
                          if (todo === null || typeof todo !== "object") {
                              return null;
                          }
                          const record = todo as Record<string, unknown>;
                          if (
                              typeof record.id !== "string" ||
                              typeof record.content !== "string" ||
                              typeof record.status !== "string"
                          ) {
                              return null;
                          }
                          const statusRaw = record.status;
                          if (
                              statusRaw !== "pending" &&
                              statusRaw !== "in_progress" &&
                              statusRaw !== "completed" &&
                              statusRaw !== "cancelled"
                          ) {
                              return null;
                          }
                          const status:
                              | "pending"
                              | "in_progress"
                              | "completed"
                              | "cancelled" = statusRaw;
                          return {
                              id: record.id,
                              content: record.content,
                              status,
                          };
                      })
                      .filter(
                          (todo): todo is NonNullable<typeof todo> =>
                              todo !== null,
                      )
                : [];
            this.postToWebview({
                type: "cursorCreatePlanRequest",
                requestId,
                ...(typeof params.name === "string" && params.name.length > 0
                    ? { name: params.name }
                    : {}),
                ...(typeof params.overview === "string" &&
                params.overview.length > 0
                    ? { overview: params.overview }
                    : {}),
                plan,
                todos,
                ...(params.isProject === true ? { isProject: true } : {}),
            });
            return await new Promise((resolve) => {
                this.createPlanWaiters.set(requestId, resolve);
            });
        }
        return {};
    }

    private async handleExtensionNotification(
        method: string,
        params: Record<string, unknown>,
    ): Promise<void> {
        if (method === "cursor/update_todos") {
            const toolCallId =
                typeof params.toolCallId === "string"
                    ? params.toolCallId
                    : "cursor-update-todos";
            const todos = Array.isArray(params.todos)
                ? (params.todos as unknown[])
                      .map((todo) => {
                          if (todo === null || typeof todo !== "object") {
                              return null;
                          }
                          const record = todo as Record<string, unknown>;
                          if (
                              typeof record.id !== "string" ||
                              typeof record.content !== "string" ||
                              typeof record.status !== "string"
                          ) {
                              return null;
                          }
                          const statusRaw = record.status;
                          if (
                              statusRaw !== "pending" &&
                              statusRaw !== "in_progress" &&
                              statusRaw !== "completed" &&
                              statusRaw !== "cancelled"
                          ) {
                              return null;
                          }
                          const status:
                              | "pending"
                              | "in_progress"
                              | "completed"
                              | "cancelled" = statusRaw;
                          return {
                              id: record.id,
                              content: record.content,
                              status,
                          };
                      })
                      .filter(
                          (todo): todo is NonNullable<typeof todo> =>
                              todo !== null,
                      )
                : [];
            this.postToWebview({
                type: "cursorUpdateTodos",
                toolCallId,
                todos,
                merge: params.merge === true,
            });
            return;
        }
        if (method === "cursor/task") {
            const rawSubagentType = params.subagentType;
            const subagentType =
                typeof rawSubagentType === "string"
                    ? rawSubagentType
                    : rawSubagentType !== null &&
                        typeof rawSubagentType === "object" &&
                        typeof (rawSubagentType as { custom?: unknown })
                            .custom === "string"
                      ? (rawSubagentType as { custom: string }).custom
                      : "unspecified";
            this.postToWebview({
                type: "cursorTask",
                toolCallId:
                    typeof params.toolCallId === "string"
                        ? params.toolCallId
                        : "cursor-task",
                description:
                    typeof params.description === "string"
                        ? params.description
                        : "Task",
                prompt: typeof params.prompt === "string" ? params.prompt : "",
                subagentType,
                ...(typeof params.model === "string"
                    ? { model: params.model }
                    : {}),
                ...(typeof params.agentId === "string"
                    ? { agentId: params.agentId }
                    : {}),
                ...(typeof params.durationMs === "number"
                    ? { durationMs: params.durationMs }
                    : {}),
            });
            return;
        }
        if (method === "cursor/generate_image") {
            this.postToWebview({
                type: "cursorGenerateImage",
                toolCallId:
                    typeof params.toolCallId === "string"
                        ? params.toolCallId
                        : "cursor-generate-image",
                description:
                    typeof params.description === "string"
                        ? params.description
                        : "Generated image",
                ...(typeof params.filePath === "string"
                    ? { filePath: params.filePath }
                    : {}),
                ...(Array.isArray(params.referenceImagePaths)
                    ? {
                          referenceImagePaths: (
                              params.referenceImagePaths as unknown[]
                          ).filter((p): p is string => typeof p === "string"),
                      }
                    : {}),
            });
        }
    }

    /**
     * Starts the agent process and creates or loads an ACP session. If `preferredModelId` is set and the
     * session advertises models, applies it before the first `sessionModels` message to the UI.
     */
    async connect(options?: AcpSessionConnectOptions): Promise<void> {
        this.seedConfigOptionsBeforeConnect();
        const init = await this.agentProcess.start();
        await this.ensureAuthenticated(init);
        const runtimeSessionId = options?.runtimeSessionId?.trim();
        const useLoad = shouldLoadRuntimeSession(
            runtimeSessionId,
            this.agentProcess.supportsLoadSession(),
        );
        let bootstrap: acp.NewSessionResponse | acp.LoadSessionResponse;
        if (useLoad && runtimeSessionId !== undefined) {
            await this.hooks?.onResumeSession?.();
            try {
                bootstrap = await this.loadSessionWithAuthRetry(
                    init,
                    runtimeSessionId,
                );
                this.acpSessionId = runtimeSessionId;
            } catch {
                await this.hooks?.onLoadSessionFailed?.();
                const created = await this.newSessionWithAuthRetry(init);
                bootstrap = created;
                this.acpSessionId = created.sessionId;
            }
        } else {
            const created = await this.newSessionWithAuthRetry(init);
            bootstrap = created;
            this.acpSessionId = created.sessionId;
        }
        const preferredModelId = options?.preferredModelId;
        if (
            bootstrap.configOptions !== undefined &&
            bootstrap.configOptions !== null
        ) {
            this.applyConfigOptions(bootstrap.configOptions);
        } else if (bootstrap.modes) {
            let state = bootstrap.modes;
            if (
                preferredModelId !== undefined &&
                preferredModelId !== state.currentModeId &&
                this.acpSessionId !== null
            ) {
                try {
                    await this.agentProcess.setSessionModel(
                        this.acpSessionId,
                        preferredModelId,
                    );
                    state = { ...state, currentModeId: preferredModelId };
                } catch {}
            }
            const selection = sessionModelStateToAcpUiSelection(state);
            this.lastModelSelection = selection;
            writeCachedSessionModels(this.config.name, selection);
            this.postToWebview({ type: "sessionModels", ...selection });
        }
        if (
            bootstrap.configOptions !== undefined &&
            bootstrap.configOptions !== null &&
            bootstrap.modes &&
            preferredModelId !== undefined
        ) {
            const modelOption = this.lastConfigOptions?.options.find(
                (option) =>
                    option.type === "select" && option.category === "model",
            );
            if (
                modelOption?.type === "select" &&
                preferredModelId !== modelOption.currentValue
            ) {
                try {
                    await this.setSessionConfigOption(
                        modelOption.configId,
                        preferredModelId,
                    );
                } catch {}
            }
        }
    }

    /** Updates the session model when the agent supports `session/set_model`. */
    async setSessionModel(modelId: string): Promise<void> {
        if (!this.acpSessionId) {
            return;
        }
        const modelConfig = this.lastConfigOptions?.options.find(
            (option) => option.type === "select" && option.category === "model",
        );
        if (modelConfig?.type === "select") {
            const wireValue = resolveModelConfigWireValue(modelConfig, modelId);
            await this.applySessionModelWireValue(
                modelConfig.configId,
                wireValue,
            );
            return;
        }
        const advertisedId = this.resolveUnstableModelId(modelId);
        const wireModelId =
            advertisedId ??
            (this.lastModelSelection !== null
                ? resolveModelConfigWireValue(
                      modelSelectOptionFromModels(this.lastModelSelection),
                      modelId,
                  )
                : modelId);
        await this.agentProcess.setSessionModel(this.acpSessionId, wireModelId);
        this.syncModelSelectionAfterWire(wireModelId);
    }

    /** Updates a session config option via `session/set_config_option`. */
    async setSessionConfigOption(
        configId: string,
        value: string | boolean,
    ): Promise<void> {
        if (!this.acpSessionId) {
            return;
        }
        const modelConfig = this.lastConfigOptions?.options.find(
            (option) => option.type === "select" && option.category === "model",
        );
        let wireValue: string | boolean = value;
        if (
            typeof value === "string" &&
            modelConfig?.type === "select" &&
            configId === modelConfig.configId
        ) {
            wireValue = resolveModelConfigWireValue(modelConfig, value);
            await this.applySessionModelWireValue(configId, wireValue);
            return;
        }
        const response = await this.agentProcess.setSessionConfigOption(
            typeof wireValue === "boolean"
                ? {
                      sessionId: this.acpSessionId,
                      configId,
                      type: "boolean",
                      value: wireValue,
                  }
                : {
                      sessionId: this.acpSessionId,
                      configId,
                      value: wireValue,
                  },
        );
        this.applyConfigOptions(response.configOptions);
    }

    /**
     * Applies a model id via `set_config_option` when advertised, otherwise
     * `setSessionMode` for composed bracket ids the agent omits.
     */
    private async applySessionModelWireValue(
        configId: string,
        wireValue: string,
    ): Promise<void> {
        if (!this.acpSessionId) {
            return;
        }
        const modelConfig = this.lastConfigOptions?.options.find(
            (option) =>
                option.type === "select" &&
                option.category === "model" &&
                option.configId === configId,
        );
        if (modelConfig?.type === "select") {
            const advertised = resolveAdvertisedModelOptionValue(
                modelConfig,
                wireValue,
            );
            if (advertised !== null) {
                const response = await this.agentProcess.setSessionConfigOption(
                    {
                        sessionId: this.acpSessionId,
                        configId,
                        value: advertised,
                    },
                );
                this.applyConfigOptions(response.configOptions);
                return;
            }
        }
        await this.setSessionModelUnadvertised(wireValue);
    }

    private async setSessionModelUnadvertised(
        wireValue: string,
    ): Promise<void> {
        if (!this.acpSessionId) {
            return;
        }
        const candidates = this.unadvertisedModelWireCandidates(wireValue);
        let lastError: unknown;
        for (const candidate of candidates) {
            try {
                await this.agentProcess.setSessionModel(
                    this.acpSessionId,
                    candidate,
                );
                this.syncModelSelectionAfterWire(candidate);
                return;
            } catch (error: unknown) {
                lastError = error;
            }
        }
        throw lastError instanceof Error
            ? lastError
            : new Error(String(lastError));
    }

    private unadvertisedModelWireCandidates(wireValue: string): string[] {
        const candidates = [wireValue];
        const parsed = parseModelIdBracketParams(wireValue);
        if (
            parsed.params.fast === undefined &&
            !candidates.includes(
                buildModelId(parsed.base, { ...parsed.params, fast: "false" }),
            )
        ) {
            candidates.push(
                buildModelId(parsed.base, { ...parsed.params, fast: "false" }),
            );
        }
        return candidates;
    }

    private syncModelSelectionAfterWire(wireModelId: string): void {
        if (this.lastConfigOptions !== null) {
            const options = this.lastConfigOptions.options.map((option) => {
                if (option.type === "select" && option.category === "model") {
                    return { ...option, currentValue: wireModelId };
                }
                return option;
            });
            this.lastConfigOptions = { options };
            writeCachedSessionConfigOptions(this.config.name, options);
            this.postToWebview({
                type: "sessionConfigOptions",
                options,
            });
        }
        if (this.lastModelSelection !== null) {
            const next: AcpUiSessionModelSelection = {
                ...this.lastModelSelection,
                currentModelId: wireModelId,
            };
            this.lastModelSelection = next;
            writeCachedSessionModels(this.config.name, next);
            this.postToWebview({ type: "sessionModels", ...next });
        }
    }

    private resolveUnstableModelId(modelId: string): string | null {
        const available = this.lastModelSelection?.availableModels ?? [];
        if (available.some((model) => model.modelId === modelId)) {
            return modelId;
        }
        const candidate = parseModelIdBracketParams(modelId);
        const keys = Object.keys(candidate.params).sort();
        const signature = JSON.stringify(candidate.params, keys);
        const match = available.find((model) => {
            const parsed = parseModelIdBracketParams(model.modelId);
            return (
                parsed.base === candidate.base &&
                JSON.stringify(
                    parsed.params,
                    Object.keys(parsed.params).sort(),
                ) === signature
            );
        });
        return match?.modelId ?? null;
    }

    private publishConfigOptions(options: AcpUiSessionConfigOption[]): void {
        if (options.length === 0) {
            return;
        }
        const normalized: AcpUiSessionConfigState = { options };
        this.lastConfigOptions = normalized;
        writeCachedSessionConfigOptions(this.config.name, options);
        this.postToWebview({
            type: "sessionConfigOptions",
            options,
        });
        const modelOption = options.find(
            (option) => option.type === "select" && option.category === "model",
        );
        if (modelOption?.type === "select") {
            const selection: AcpUiSessionModelSelection = {
                currentModelId: modelOption.currentValue,
                availableModels: modelOption.options.map((choice) => ({
                    modelId: choice.value,
                    name: choice.name,
                })),
            };
            this.lastModelSelection = selection;
            writeCachedSessionModels(this.config.name, selection);
            this.postToWebview({ type: "sessionModels", ...selection });
        }
    }

    private seedConfigOptionsBeforeConnect(): void {
        if (this.lastConfigOptions !== null) {
            return;
        }
        const seed = readCachedComposerSeed(this.config.name);
        if (seed.configOptions !== null) {
            this.publishConfigOptions(seed.configOptions);
            return;
        }
        if (seed.modelSelection !== null) {
            this.lastModelSelection = seed.modelSelection;
            this.postToWebview({
                type: "sessionModels",
                ...seed.modelSelection,
            });
            return;
        }
        this.postToWebview({ type: "sessionConfigOptionsLoading" });
    }

    private applyConfigOptions(
        raw: ReadonlyArray<acp.SessionConfigOption>,
    ): void {
        const normalized = sessionConfigOptionsFromAgent(raw);
        if (normalized !== null) {
            this.publishConfigOptions(normalized.options);
        }
    }

    /** Sends a user prompt. The bridge forwards all session updates to the UI. */
    async prompt(text: string): Promise<void> {
        if (!this.acpSessionId) {
            this.postToWebview({
                type: "error",
                message: "Agent session not connected.",
            });
            return;
        }
        this.toolCallKindTracking = createToolCallKindTracking();
        this.prompting = true;
        try {
            const result = await this.agentProcess.prompt(
                this.acpSessionId,
                text,
            );
            this.postToWebview({
                type: "turnComplete",
                stopReason: result.stopReason,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.postToWebview({ type: "error", message });
        } finally {
            this.prompting = false;
        }
    }

    /** Cancels the current prompt turn, if one is in progress. */
    async cancel(): Promise<void> {
        this.cancelPendingPermissions();
        this.cancelPendingExtensionRequests();
        if (!this.prompting || !this.acpSessionId) {
            return;
        }
        await this.agentProcess.cancel(this.acpSessionId);
    }

    /** Whether a prompt is currently in flight. */
    get isPrompting(): boolean {
        return this.prompting;
    }

    /** ACP session id after `connect`, used for persistence/restore metadata. */
    get sessionId(): string | null {
        return this.acpSessionId;
    }

    /** Kills the agent process and releases resources. */
    dispose(): void {
        this.cancelPendingPermissions();
        this.cancelPendingExtensionRequests();
        void this.logoutBestEffort();
        this.agentProcess.dispose();
        this.acpSessionId = null;
    }

    private async ensureAuthenticated(
        init: acp.InitializeResponse,
    ): Promise<void> {
        const methodId = resolveAuthMethodId(
            init.authMethods,
            this.config.authMethodId,
        );
        if (methodId === undefined) {
            return;
        }
        try {
            await this.agentProcess.authenticate(methodId);
        } catch (err: unknown) {
            const detail = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Authentication failed for agent "${this.config.name}" (methodId="${methodId}"): ${detail}. Try running agent login or set ib-acp-ui.agents authMethodId.`,
            );
        }
    }

    private async newSessionWithAuthRetry(
        init: acp.InitializeResponse,
    ): Promise<acp.NewSessionResponse> {
        try {
            return await this.agentProcess.newSession();
        } catch (err: unknown) {
            if (!isAuthRequiredError(err)) {
                throw err;
            }
            await this.ensureAuthenticated(init);
            return await this.agentProcess.newSession();
        }
    }

    private async loadSessionWithAuthRetry(
        init: acp.InitializeResponse,
        runtimeSessionId: string,
    ): Promise<acp.LoadSessionResponse> {
        try {
            return await this.agentProcess.loadSession(runtimeSessionId);
        } catch (err: unknown) {
            if (!isAuthRequiredError(err)) {
                throw err;
            }
            await this.ensureAuthenticated(init);
            return await this.agentProcess.loadSession(runtimeSessionId);
        }
    }

    private async logoutBestEffort(): Promise<void> {
        if (!this.agentProcess.supportsLogout()) {
            return;
        }
        try {
            await this.agentProcess.logout();
        } catch (err: unknown) {
            const detail = err instanceof Error ? err.message : String(err);
            console.warn(
                `[ACP Agent ${this.config.name}] logout failed: ${detail}`,
            );
        }
    }

    private handleSessionUpdate(params: acp.SessionNotification): void {
        if (params.update.sessionUpdate === "session_info_update") {
            this.hooks?.onSessionInfoUpdate?.(params.update);
        }
        const messages = sessionUpdateToWebviewMessages(
            params.update,
            this.toolCallKindTracking,
        );
        for (const msg of messages) {
            this.postToWebview(msg);
        }
    }
}

function isAuthRequiredError(err: unknown): boolean {
    return err instanceof RequestError && err.code === -32000;
}
