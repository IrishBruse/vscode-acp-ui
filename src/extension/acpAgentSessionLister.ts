import type * as acp from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import type { AcpAgentConfig } from "../acp/config/vscodeSettingsAgents";
import { resolveAuthMethodId } from "../acp/domain/agentSpawnConfig";
import {
    AcpAgentProcess,
    type RequestPermissionHandler,
} from "../acp/infrastructure/acpAgentProcess";
import { createDefaultAcpSessionHostRuntime } from "../platform/vscode/defaultHostRuntime";
import { sortSessionInfos } from "./acpAgentSessionListFormat";
import { getAcpUiExtensionActivation } from "./extensionServices";

export {
    sessionInfoLabel,
    sessionInfoSortKey,
    sortSessionInfos,
} from "./acpAgentSessionListFormat";

const cancelledPermission: RequestPermissionHandler = async () => ({
    outcome: { outcome: "cancelled" },
});

function isAuthRequiredError(err: unknown): boolean {
    return err instanceof RequestError && err.code === -32000;
}

async function ensureAuthenticated(
    agent: AcpAgentProcess,
    init: acp.InitializeResponse,
    config: AcpAgentConfig,
): Promise<void> {
    const methodId = resolveAuthMethodId(init.authMethods, config.authMethodId);
    if (methodId === undefined) {
        return;
    }
    await agent.authenticate(methodId);
}

async function listSessionsWithAuthRetry(
    agent: AcpAgentProcess,
    init: acp.InitializeResponse,
    config: AcpAgentConfig,
    cwd: string,
): Promise<acp.SessionInfo[]> {
    try {
        return await agent.listAllSessions(cwd);
    } catch (err: unknown) {
        if (!isAuthRequiredError(err)) {
            throw err;
        }
        await ensureAuthenticated(agent, init, config);
        return agent.listAllSessions(cwd);
    }
}

export type FetchAgentSessionsResult = {
    supported: boolean;
    deleteSupported: boolean;
    sessions: acp.SessionInfo[];
};

/**
 * Spawns a short-lived agent connection and returns `session/list` rows for the workspace cwd.
 */
export async function fetchAgentSessionsForWorkspace(
    config: AcpAgentConfig,
    cwd: string,
): Promise<FetchAgentSessionsResult> {
    const { rpcNdjsonSink } = getAcpUiExtensionActivation();
    const host = createDefaultAcpSessionHostRuntime(rpcNdjsonSink);
    const agent = new AcpAgentProcess({
        config,
        requestPermission: cancelledPermission,
        hostFilesystem: host.hostFilesystem,
        rpcNdjsonSink: host.rpcNdjsonSink,
        getWorkspaceRoot: host.getWorkspaceRoot,
    });
    try {
        const init = await agent.start();
        if (!agent.supportsListSessions()) {
            return { supported: false, deleteSupported: false, sessions: [] };
        }
        await ensureAuthenticated(agent, init, config);
        const sessions = await listSessionsWithAuthRetry(
            agent,
            init,
            config,
            cwd,
        );
        return {
            supported: true,
            deleteSupported: agent.supportsDeleteSessions(),
            sessions: sortSessionInfos(sessions),
        };
    } finally {
        agent.dispose();
    }
}

/**
 * Best-effort `session/delete` on a short-lived agent connection.
 */
export type DeleteAgentSessionResult = {
    supported: boolean;
    deleted: boolean;
};

export async function deleteAgentSession(
    config: AcpAgentConfig,
    runtimeSessionId: string,
): Promise<DeleteAgentSessionResult> {
    const { rpcNdjsonSink } = getAcpUiExtensionActivation();
    const host = createDefaultAcpSessionHostRuntime(rpcNdjsonSink);
    const agent = new AcpAgentProcess({
        config,
        requestPermission: cancelledPermission,
        hostFilesystem: host.hostFilesystem,
        rpcNdjsonSink: host.rpcNdjsonSink,
        getWorkspaceRoot: host.getWorkspaceRoot,
    });
    try {
        const init = await agent.start();
        if (!agent.supportsDeleteSessions()) {
            return { supported: false, deleted: false };
        }
        await ensureAuthenticated(agent, init, config);
        try {
            await agent.deleteSession(runtimeSessionId);
        } catch (err: unknown) {
            if (!isAuthRequiredError(err)) {
                throw err;
            }
            await ensureAuthenticated(agent, init, config);
            await agent.deleteSession(runtimeSessionId);
        }
        return { supported: true, deleted: true };
    } finally {
        agent.dispose();
    }
}
