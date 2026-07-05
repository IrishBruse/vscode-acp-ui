/**
 * Standalone WebSocket bridge for the ACP UI (dev). Reuses {@link AcpSessionBridge} and the
 * same protocol/mapping as the VS Code extension — unlike a duplicated inline ACP client.
 *
 * Usage: `npm run dev:standalone` (Vite + this server with `tsx --watch`).
 */

import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type * as acp from "@agentclientprotocol/sdk";
import { WebSocket, WebSocketServer } from "ws";
import type { AcpAgentSpawnConfig } from "../src/acp/domain/agentSpawnConfig";
import { parseAcpAgentsJsonFileContent } from "../src/acp/domain/agentSpawnConfig";
import {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    sessionUpdateToWebviewMessages,
} from "../src/acp/mapping/sessionUpdateMapping";
import { NullAcpRpcNdjsonSink } from "../src/acp/ports/rpcNdjsonSink";
import { AcpSessionBridge } from "../src/acp/session/acpSessionBridge";
import { parseSessionModelsFromReadmeNdjson } from "../src/acp/session/readmeSessionModels";
import { readCachedComposerSeed } from "../src/acp/session/sessionConfigOptionsCache";
import type { AcpUiSessionModelSelection } from "../src/acp/session/sessionModels";
import { FileAcpRpcNdjsonSink } from "../src/platform/node/fileRpcNdjsonSink";
import { createNodeAcpSessionHostRuntime } from "../src/platform/node/nodeAcpSessionHostRuntime";
import { formatPathWithTilde } from "../src/platform/pathDisplay";
import {
    type ExtensionToWebviewMessage,
    tryParseWebviewMessage,
} from "../src/protocol/extensionHostMessages";

const PORT = Number(process.env.ACP_WS_PORT ?? 5174);
const STANDALONE_DIR = dirname(fileURLToPath(import.meta.url));

const rpcLogEnv = process.env.ACP_RPC_LOG;
const defaultRpcLogFile = join(STANDALONE_DIR, "acp-rpc.ndjson");
const rpcLogPath: string | null = ((): string | null => {
    if (rpcLogEnv === "0" || rpcLogEnv === "false" || rpcLogEnv === "") {
        return null;
    }
    if (rpcLogEnv === undefined) {
        return defaultRpcLogFile;
    }
    if (rpcLogEnv === "1" || rpcLogEnv === "true") {
        return defaultRpcLogFile;
    }
    return rpcLogEnv;
})();

const sharedRpcSink =
    rpcLogPath === null
        ? new NullAcpRpcNdjsonSink()
        : new FileAcpRpcNdjsonSink(rpcLogPath);

if (rpcLogPath !== null) {
    console.log(`ACP JSON-RPC log: ${rpcLogPath}`);
}

// ── Fixture playback (recorded NDJSON sessions) ─────────────────────────────

type JsonRpcNotification = { jsonrpc: "2.0"; method: string; params: unknown };
type JsonRpcResponse = {
    jsonrpc: "2.0";
    id: number | string;
    result: Record<string, unknown>;
};

const fixtureLineDelayMs = 100;
const maxWorkspaceFileAutocompleteEntries = 1500;
const ignoredWorkspaceDirs = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
]);

function workspaceFilesForAutocomplete(
    workspaceRoot: string,
): string[] | undefined {
    const out: string[] = [];
    const stack: string[] = [workspaceRoot];
    while (
        stack.length > 0 &&
        out.length < maxWorkspaceFileAutocompleteEntries
    ) {
        const current = stack.pop();
        if (current === undefined) {
            continue;
        }
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.name !== ".github") {
                if (entry.isDirectory()) {
                    continue;
                }
            }
            if (entry.isDirectory()) {
                if (ignoredWorkspaceDirs.has(entry.name)) {
                    continue;
                }
                stack.push(join(current, entry.name));
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const absolutePath = join(current, entry.name);
            const relativePath = absolutePath
                .slice(workspaceRoot.length)
                .replace(/^\/+/, "");
            if (relativePath.length > 0) {
                out.push(relativePath);
            }
            if (out.length >= maxWorkspaceFileAutocompleteEntries) {
                break;
            }
        }
    }
    out.sort((a, b) => a.localeCompare(b));
    return out.length > 0 ? out : undefined;
}

function resolveFixture(body: string): string | null {
    const candidate = body.trim();
    if (!/^[a-z0-9-]+$/.test(candidate)) {
        return null;
    }
    const mockPrefix = "mock-";
    if (
        candidate.startsWith(mockPrefix) &&
        candidate.length > mockPrefix.length
    ) {
        const stem = candidate.slice(mockPrefix.length);
        if (/^[a-z0-9-]+$/.test(stem)) {
            const mockPath = join(STANDALONE_DIR, "mock", `${stem}.ndjson`);
            if (existsSync(mockPath)) {
                return mockPath;
            }
        }
    }
    const fixturePath = join(STANDALONE_DIR, `${candidate}.ndjson`);
    return existsSync(fixturePath) ? fixturePath : null;
}

async function replayFixture(
    fixturePath: string,
    send: (msg: ExtensionToWebviewMessage) => void,
): Promise<string> {
    const lines = readFileSync(fixturePath, "utf-8")
        .split("\n")
        .filter((l) => l.trim().length > 0);

    let stopReason = "end_turn";
    const toolKindTracking = createToolCallKindTracking();

    for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
            await new Promise<void>((resolve) =>
                setTimeout(resolve, fixtureLineDelayMs),
            );
        }

        const msg = JSON.parse(lines[i]) as
            | JsonRpcNotification
            | JsonRpcResponse;

        if ("method" in msg && msg.method === "session/update") {
            const params = (msg as JsonRpcNotification).params as {
                update: acp.SessionUpdate;
            };
            const messages = sessionUpdateToWebviewMessages(
                params.update,
                toolKindTracking,
            );
            for (const webviewMessage of messages) {
                send(webviewMessage);
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            continue;
        }

        if ("method" in msg && msg.method === "session/request_permission") {
            const params = (msg as JsonRpcNotification)
                .params as acp.RequestPermissionRequest;
            const requestId = `perm-replay-${i}`;
            for (const webviewMessage of extensionMessagesForPermissionRequest(
                requestId,
                params,
            )) {
                send(webviewMessage);
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            continue;
        }

        if (!("method" in msg) && "result" in msg) {
            const result = (msg as JsonRpcResponse).result;
            if (typeof result.stopReason === "string") {
                stopReason = result.stopReason;
            }
        }
    }

    return stopReason;
}

// ── Agent config ────────────────────────────────────────────────────────────

function loadAgentConfigs(): AcpAgentSpawnConfig[] {
    const configPath = join(STANDALONE_DIR, "acp-agent.json");
    if (!existsSync(configPath)) {
        console.error(`ACP agent config not found: ${configPath}`);
        console.error(
            "Add acp-agent.json: a JSON array of agents (name, command, optional args, env), or one agent object.",
        );
        process.exit(1);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
            `Failed to read or parse ACP agent config ${configPath}: ${message}`,
        );
        process.exit(1);
    }
    const list = parseAcpAgentsJsonFileContent(parsed);
    if (list === undefined || list.length === 0) {
        console.error(`Invalid ACP agent config in ${configPath}.`);
        process.exit(1);
    }
    return list;
}

const agentConfigs = loadAgentConfigs();
const firstAgentConfig = agentConfigs[0];
if (firstAgentConfig === undefined) {
    throw new Error("loadAgentConfigs returned empty");
}

function loadReadmeSessionModels(): AcpUiSessionModelSelection | null {
    try {
        const text = readFileSync(
            join(STANDALONE_DIR, "mock/readme.ndjson"),
            "utf-8",
        );
        return parseSessionModelsFromReadmeNdjson(text);
    } catch {
        return null;
    }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
    const sessionId = randomUUID();
    console.log(`client connected  session=${sessionId}`);

    let bridge: AcpSessionBridge | null = null;
    let prompting = false;
    /** Last model chosen in the UI; applied on the next `connect` (including after `/clear`). */
    let userPreferredModelId: string | null = null;
    let selectedAgentName = firstAgentConfig.name;
    let connectInFlight: Promise<void> | null = null;

    const hostRuntime = createNodeAcpSessionHostRuntime({
        rpcNdjsonSink: sharedRpcSink,
        workspaceRoot: process.cwd(),
    });

    function send(msg: ExtensionToWebviewMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    function activeAgentConfig(): AcpAgentSpawnConfig {
        const found = agentConfigs.find((c) => c.name === selectedAgentName);
        return found ?? firstAgentConfig;
    }

    function disposeBridge(): void {
        if (bridge !== null) {
            bridge.dispose();
            bridge = null;
        }
    }

    async function runConnectAgent(): Promise<void> {
        disposeBridge();
        const cfg = activeAgentConfig();
        const next = new AcpSessionBridge(cfg, send, hostRuntime);
        bridge = next;
        const preferred = userPreferredModelId ?? undefined;
        await next.connect(preferred);
    }

    async function connectAgent(): Promise<void> {
        if (bridge !== null) {
            return;
        }
        if (connectInFlight !== null) {
            await connectInFlight;
            return;
        }
        const started = runConnectAgent();
        connectInFlight = started;
        try {
            await started;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            send({
                type: "error",
                message: `Failed to connect to agent: ${message}`,
            });
            disposeBridge();
        } finally {
            connectInFlight = null;
        }
    }

    const handleMessage = async (raw: string): Promise<void> => {
        let rawObj: unknown;
        try {
            rawObj = JSON.parse(raw) as unknown;
        } catch {
            return;
        }
        const parsed = tryParseWebviewMessage(rawObj);
        if (parsed === null) {
            return;
        }

        if (parsed.type === "ready") {
            const workspaceFiles = workspaceFilesForAutocomplete(process.cwd());
            const seed = loadReadmeSessionModels();
            const cachedSeed = readCachedComposerSeed(selectedAgentName);
            send({
                type: "init",
                sessionId,
                title: "ACP UI (standalone)",
                workspaceLabel: formatPathWithTilde(process.cwd()),
                agentVersionLabel: undefined,
                acpAgentName: selectedAgentName,
                availableAcpAgents: agentConfigs.map((c) => c.name),
                ...(workspaceFiles !== undefined ? { workspaceFiles } : {}),
                ...(cachedSeed.configOptions !== null
                    ? { sessionConfigOptionsSeed: cachedSeed.configOptions }
                    : {}),
                ...(cachedSeed.modelSelection !== null
                    ? { sessionModels: cachedSeed.modelSelection }
                    : seed !== null
                      ? { sessionModels: seed }
                      : {}),
                lockSessionAgent: false,
            });
            return;
        }

        if (parsed.type === "resetSession") {
            disposeBridge();
            send({ type: "sessionReset" });
            const resetSeed = readCachedComposerSeed(selectedAgentName);
            if (resetSeed.configOptions !== null) {
                send({
                    type: "sessionConfigOptions",
                    options: resetSeed.configOptions,
                });
            } else if (resetSeed.modelSelection !== null) {
                send({ type: "sessionModels", ...resetSeed.modelSelection });
            } else {
                send({ type: "sessionConfigOptionsLoading" });
            }
            void connectAgent();
            return;
        }

        if (parsed.type === "permissionResponse") {
            bridge?.handlePermissionResponse(parsed);
            return;
        }

        if (parsed.type === "setSessionAgent") {
            const next = agentConfigs.find((c) => c.name === parsed.agentName);
            if (next === undefined) {
                send({
                    type: "error",
                    message: `Unknown agent: ${parsed.agentName}`,
                });
                return;
            }
            selectedAgentName = next.name;
            const hadBridge = bridge !== null;
            if (hadBridge) {
                disposeBridge();
            }
            send({
                type: "acpAgentSelection",
                currentAgentName: next.name,
                availableAgentNames: agentConfigs.map((c) => c.name),
            });
            if (hadBridge) {
                void connectAgent();
            }
            return;
        }

        if (parsed.type === "savePromptHistory") {
            return;
        }

        if (parsed.type === "setSessionModel") {
            userPreferredModelId = parsed.modelId;
            if (bridge) {
                try {
                    await bridge.setSessionModel(parsed.modelId);
                } catch (err: unknown) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    send({
                        type: "error",
                        message: `Model change failed: ${message}`,
                    });
                }
            }
            return;
        }

        if (parsed.type === "setSessionConfigOption") {
            if (bridge) {
                try {
                    await bridge.setSessionConfigOption(
                        parsed.configId,
                        parsed.value,
                    );
                } catch (err: unknown) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    send({
                        type: "error",
                        message: `Config change failed: ${message}`,
                    });
                }
            }
            return;
        }

        if (parsed.type === "send") {
            const fixturePath = resolveFixture(parsed.body);
            if (fixturePath !== null) {
                console.log(`fixture: replaying ${fixturePath}`);
                prompting = true;
                try {
                    const stopReason = await replayFixture(fixturePath, send);
                    send({ type: "turnComplete", stopReason });
                } catch (err: unknown) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    send({
                        type: "error",
                        message: `Fixture replay error: ${message}`,
                    });
                } finally {
                    prompting = false;
                }
                return;
            }

            if (!bridge) {
                await connectAgent();
            }
            if (!bridge) {
                return;
            }
            if (bridge.isPrompting) {
                await bridge.cancel();
            }
            prompting = true;
            try {
                await bridge.prompt(parsed.body);
            } finally {
                prompting = false;
            }
            return;
        }

        if (parsed.type === "cancel" && bridge) {
            if (prompting) {
                await bridge.cancel();
            }
        }
    };

    ws.on("message", (data) => {
        void handleMessage(data.toString());
    });

    ws.on("close", () => {
        disposeBridge();
        console.log(`client disconnected session=${sessionId}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`WebSocket bridge listening on ws://localhost:${PORT}`);
    for (const c of agentConfigs) {
        const argLine = c.args.length > 0 ? ` ${c.args.join(" ")}` : "";
        console.log(`Agent "${c.name}": ${c.command}${argLine}`);
    }
    console.log(
        `Open http://localhost:5173 after starting the Vite dev server`,
    );
});
