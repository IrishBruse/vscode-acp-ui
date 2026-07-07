import { type ChildProcess, spawn } from "node:child_process";
import { Readable, Transform, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import {
    type AcpAgentSpawnConfig,
    isCursorAcpAgent,
    PARAMETERIZED_MODEL_PICKER_META_KEY,
} from "../domain/agentSpawnConfig";
import type { AcpHostFilesystem } from "../ports/hostFilesystem";
import type {
    AcpRpcNdjsonDirection,
    AcpRpcNdjsonSink,
} from "../ports/rpcNdjsonSink";

/** Node `fs` and VS Code `FileSystemError` both use distinct codes for a missing path. */
function isFileNotFoundError(error: unknown): boolean {
    if (error === null || typeof error !== "object") {
        return false;
    }
    const code = (error as { code?: string }).code;
    return code === "ENOENT" || code === "FileNotFound";
}

/**
 * Passes bytes through while appending each complete NDJSON line to the configured sink.
 */
function createNdjsonRpcLogTap(
    sink: AcpRpcNdjsonSink,
    direction: AcpRpcNdjsonDirection,
    agentName: string,
): Transform {
    let buffer = "";
    return new Transform({
        transform(
            chunk: Buffer,
            chunkEncoding: BufferEncoding,
            callback,
        ): void {
            void chunkEncoding;
            buffer += chunk.toString("utf8");
            const parts = buffer.split("\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.length > 0) {
                    sink.appendRawNdjsonLine(trimmed, {
                        direction,
                        agentName,
                    });
                }
            }
            callback(null, chunk);
        },
        flush(callback): void {
            const trimmed = buffer.trim();
            if (trimmed.length > 0) {
                sink.appendRawNdjsonLine(trimmed, { direction, agentName });
            }
            buffer = "";
            callback();
        },
    });
}

function ndJsonStreamTapsForChild(
    child: ChildProcess,
    rpcNdjsonSink: AcpRpcNdjsonSink,
    agentName: string,
): {
    stdinWeb: WritableStream;
    stdoutWeb: ReadableStream<Uint8Array>;
} {
    if (!rpcNdjsonSink.isLoggingEnabled) {
        return {
            stdinWeb: Writable.toWeb(child.stdin!),
            stdoutWeb: Readable.toWeb(
                child.stdout!,
            ) as ReadableStream<Uint8Array>,
        };
    }
    const towardAgent = createNdjsonRpcLogTap(
        rpcNdjsonSink,
        "toAgent",
        agentName,
    );
    const fromAgent = createNdjsonRpcLogTap(
        rpcNdjsonSink,
        "fromAgent",
        agentName,
    );
    towardAgent.pipe(child.stdin!);
    child.stdout!.pipe(fromAgent);
    return {
        stdinWeb: Writable.toWeb(towardAgent),
        stdoutWeb: Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>,
    };
}

/** Callback invoked whenever the agent sends a session/update notification. */
export type SessionUpdateHandler = (params: acp.SessionNotification) => void;

/** Thrown when the agent negotiates an ACP protocol version this client build does not support. */
export class AcpProtocolVersionMismatchError extends Error {
    readonly negotiatedVersion: number;
    readonly supportedVersion: number;

    constructor(negotiatedVersion: number, supportedVersion: number) {
        const direction =
            negotiatedVersion > supportedVersion
                ? "Update ACP UI to a newer version, or use an agent that supports the current protocol."
                : "Update the agent to a newer version, or use an older ACP UI build if one is available.";
        super(
            `ACP protocol version mismatch: ACP UI supports protocol v${supportedVersion} but the agent negotiated v${negotiatedVersion}. ${direction}`,
        );
        this.name = "AcpProtocolVersionMismatchError";
        this.negotiatedVersion = negotiatedVersion;
        this.supportedVersion = supportedVersion;
    }
}

let configuredClientInfo: acp.Implementation | undefined;

/** Sets `clientInfo` sent on every `initialize` (extension package metadata at activation). */
export function configureAcpClientInfo(info: acp.Implementation): void {
    configuredClientInfo = info;
}

/** Builds `clientInfo` from extension `package.json` fields. */
export function buildAcpClientInfoFromPackage(pkg: {
    name?: string;
    version?: string;
    displayName?: string;
}): acp.Implementation {
    const name =
        typeof pkg.name === "string" && pkg.name.length > 0
            ? pkg.name
            : "ib-acp-ui";
    const version =
        typeof pkg.version === "string" && pkg.version.length > 0
            ? pkg.version
            : "0.0.0";
    const title =
        typeof pkg.displayName === "string" && pkg.displayName.length > 0
            ? pkg.displayName
            : "ACP UI";
    return { name, version, title };
}

/** `clientInfo` for the `initialize` request (configured at activation or a safe fallback). */
export function buildAcpClientInfo(): acp.Implementation {
    return (
        configuredClientInfo ??
        buildAcpClientInfoFromPackage({
            name: "ib-acp-ui",
            version: "0.0.0",
            displayName: "ACP UI",
        })
    );
}

/** Ensures the negotiated protocol version is supported by this client build. */
export function assertNegotiatedProtocolVersion(
    response: acp.InitializeResponse,
): void {
    if (response.protocolVersion !== acp.PROTOCOL_VERSION) {
        throw new AcpProtocolVersionMismatchError(
            response.protocolVersion,
            acp.PROTOCOL_VERSION,
        );
    }
}

/** Client capabilities for the ACP initialize handshake (matches Zed for Cursor). */
export function buildAcpClientCapabilities(
    config: AcpAgentSpawnConfig,
): acp.ClientCapabilities {
    const capabilities: acp.ClientCapabilities = {
        fs: { readTextFile: true, writeTextFile: true },
    };
    if (isCursorAcpAgent(config)) {
        capabilities._meta = {
            [PARAMETERIZED_MODEL_PICKER_META_KEY]: true,
        };
    }
    return capabilities;
}

/** Resolves `session/request_permission` (UI surfaces this as a dialog). */
export type RequestPermissionHandler = (
    params: acp.RequestPermissionRequest,
) => Promise<acp.RequestPermissionResponse>;

export type AcpAgentProcessOptions = {
    config: AcpAgentSpawnConfig;
    /** Sent on `initialize`; defaults to {@link buildAcpClientInfo}. */
    clientInfo?: acp.Implementation;
    requestPermission: RequestPermissionHandler;
    extMethod?: (
        method: string,
        params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    extNotification?: (
        method: string,
        params: Record<string, unknown>,
    ) => Promise<void>;
    hostFilesystem: AcpHostFilesystem;
    rpcNdjsonSink: AcpRpcNdjsonSink;
    /** Workspace folder used for spawn `cwd` and `session/new` `cwd` metadata. */
    getWorkspaceRoot: () => string | undefined;
    /** Called when the agent subprocess exits or stdio closes. */
    onProcessExit?: () => void;
};

/**
 * Manages the lifecycle of a single ACP agent subprocess: spawn, initialize handshake,
 * session creation, prompting, and teardown.
 */
export class AcpAgentProcess {
    private child: ChildProcess | null = null;
    private connection: acp.ClientSideConnection | null = null;
    private initResponse: acp.InitializeResponse | null = null;
    private sessionUpdateHandler: SessionUpdateHandler | null = null;

    constructor(private readonly options: AcpAgentProcessOptions) {}

    /** Registers a handler that receives every `session/update` notification. */
    onSessionUpdate(handler: SessionUpdateHandler): void {
        this.sessionUpdateHandler = handler;
    }

    async start(): Promise<acp.InitializeResponse> {
        const cwd = this.options.getWorkspaceRoot();
        const env = { ...process.env, ...this.options.config.env };

        console.info(
            `[ACP Agent ${this.options.config.name}] spawning command="${this.options.config.command}" args=${JSON.stringify(this.options.config.args)} cwd="${cwd ?? "<undefined>"}"`,
        );

        this.child = spawn(
            this.options.config.command,
            this.options.config.args,
            {
                stdio: ["pipe", "pipe", "pipe"],
                cwd,
                env,
            },
        );

        this.child.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            console.error(
                `[ACP Agent ${this.options.config.name}] stderr: ${text}`,
            );
        });

        this.child.on("error", (err) => {
            const nodeErr = err as NodeJS.ErrnoException;
            console.error(
                `[ACP Agent ${this.options.config.name}] process error code=${nodeErr.code ?? "unknown"} message="${nodeErr.message}" command="${this.options.config.command}"`,
                err,
            );
        });

        this.child.on("exit", (code, signal) => {
            console.error(
                `[ACP Agent ${this.options.config.name}] exited code=${code ?? "null"} signal=${signal ?? "null"}`,
            );
            this.connection = null;
            this.options.onProcessExit?.();
        });

        this.child.on("close", (code, signal) => {
            console.error(
                `[ACP Agent ${this.options.config.name}] stdio closed code=${code ?? "null"} signal=${signal ?? "null"}`,
            );
        });

        const { stdinWeb, stdoutWeb } = ndJsonStreamTapsForChild(
            this.child,
            this.options.rpcNdjsonSink,
            this.options.config.name,
        );
        const stream = acp.ndJsonStream(stdinWeb, stdoutWeb);

        const client: acp.Client = {
            requestPermission: async (params) =>
                this.options.requestPermission(params),
            sessionUpdate: async (params) => {
                this.sessionUpdateHandler?.(params);
            },
            extMethod: async (method, params) => {
                if (this.options.extMethod === undefined) {
                    return {};
                }
                return this.options.extMethod(method, params);
            },
            extNotification: async (method, params) => {
                if (this.options.extNotification === undefined) {
                    return;
                }
                await this.options.extNotification(method, params);
            },
            readTextFile: async (params) => this.handleReadTextFile(params),
            writeTextFile: async (params) => this.handleWriteTextFile(params),
        };

        this.connection = new acp.ClientSideConnection(
            (_agent) => client,
            stream,
        );

        const response = await this.connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: buildAcpClientCapabilities(this.options.config),
            clientInfo: this.options.clientInfo ?? buildAcpClientInfo(),
        });
        assertNegotiatedProtocolVersion(response);

        this.initResponse = response;
        return response;
    }

    async authenticate(methodId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        await this.connection.authenticate({ methodId });
    }

    supportsLogout(): boolean {
        return this.initResponse?.agentCapabilities?.auth?.logout != null;
    }

    async logout(): Promise<void> {
        if (!this.connection || !this.supportsLogout()) {
            return;
        }
        await this.connection.logout({});
    }

    getInitializeResponse(): acp.InitializeResponse | null {
        return this.initResponse;
    }

    supportsListSessions(): boolean {
        return (
            this.initResponse?.agentCapabilities?.sessionCapabilities?.list !=
            null
        );
    }

    supportsLoadSession(): boolean {
        return this.initResponse?.agentCapabilities?.loadSession === true;
    }

    supportsDeleteSessions(): boolean {
        const sessionCapabilities = this.initResponse?.agentCapabilities
            ?.sessionCapabilities as { delete?: unknown } | undefined;
        return sessionCapabilities?.delete != null;
    }

    async listSessions(
        params: acp.ListSessionsRequest = {},
    ): Promise<acp.ListSessionsResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsListSessions()) {
            throw new Error("Agent does not support session/list");
        }
        return this.connection.listSessions(params);
    }

    /** Fetches every page of `session/list` for the given filter. */
    async listAllSessions(cwd?: string): Promise<acp.SessionInfo[]> {
        const sessions: acp.SessionInfo[] = [];
        let cursor: string | null | undefined;
        do {
            const response = await this.listSessions({
                ...(cwd !== undefined ? { cwd } : {}),
                ...(cursor !== undefined && cursor !== null && cursor.length > 0
                    ? { cursor }
                    : {}),
            });
            sessions.push(...response.sessions);
            cursor = response.nextCursor;
        } while (cursor != null && cursor.length > 0);
        return sessions;
    }

    async loadSession(sessionId: string): Promise<acp.LoadSessionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsLoadSession()) {
            throw new Error("Agent does not support session/load");
        }
        const cwd = this.options.getWorkspaceRoot() ?? process.cwd();
        return this.connection.loadSession({
            sessionId,
            cwd,
            mcpServers: [],
        });
    }

    async deleteSession(sessionId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        if (!this.supportsDeleteSessions()) {
            throw new Error("Agent does not support session/delete");
        }
        await this.connection.deleteSession({ sessionId });
    }

    async newSession(): Promise<acp.NewSessionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        const cwd = this.options.getWorkspaceRoot() ?? process.cwd();
        return this.connection.newSession({ cwd, mcpServers: [] });
    }

    async setSessionModel(sessionId: string, modelId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        await this.connection.setSessionMode({ sessionId, modeId: modelId });
    }

    async setSessionConfigOption(
        params: acp.SetSessionConfigOptionRequest,
    ): Promise<acp.SetSessionConfigOptionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        return this.connection.setSessionConfigOption(params);
    }

    async prompt(sessionId: string, text: string): Promise<acp.PromptResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        return this.connection.prompt({
            sessionId,
            prompt: [{ type: "text", text }],
        });
    }

    async cancel(sessionId: string): Promise<void> {
        if (!this.connection) {
            return;
        }
        await this.connection.cancel({ sessionId });
    }

    dispose(): void {
        if (this.child) {
            this.child.kill();
            this.child = null;
        }
        this.connection = null;
        this.initResponse = null;
    }

    private async handleReadTextFile(
        params: acp.ReadTextFileRequest,
    ): Promise<acp.ReadTextFileResponse> {
        try {
            const content = await this.options.hostFilesystem.readTextFile(
                params.path,
            );
            return { content };
        } catch (err) {
            // Agents (e.g. Gemini CLI) read before write to merge edits; a missing file must
            // behave like an empty document, not a JSON-RPC error, or create flows fail.
            if (isFileNotFoundError(err)) {
                return { content: "" };
            }
            throw err;
        }
    }

    private async handleWriteTextFile(
        params: acp.WriteTextFileRequest,
    ): Promise<acp.WriteTextFileResponse> {
        await this.options.hostFilesystem.writeTextFile(
            params.path,
            params.content,
        );
        return {};
    }
}
