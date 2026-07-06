# Authentication

## User facing

When you connect to an agent that requires login after startup, ACP UI runs the agent's auth flow automatically.
You do not need to pre-authenticate in a separate terminal for agents that advertise agent-type auth methods.

If auth fails, the chat shows a clear error with the method id and hints to run agent login or set `authMethodId` in settings.

## Implementation

After `initialize`, [ensureAuthenticated](../../src/acp/session/acpSessionBridge.ts#L880-L898) calls [resolveAuthMethodId](../../src/acp/domain/agentSpawnConfig.ts#L42-L68) on advertised `authMethods`.
When a method id is resolved, [authenticate](../../src/acp/infrastructure/acpAgentProcess.ts#L230-L235) runs on the SDK connection.

[resolveAuthMethodId](../../src/acp/domain/agentSpawnConfig.ts#L42-L68) prefers a configured `authMethodId` on the spawn config when it matches an agent-type method.
Otherwise it picks the first agent-type method.
Env-var and terminal auth methods are rejected with an explicit error.

[newSessionWithAuthRetry](../../src/acp/session/acpSessionBridge.ts#L900-L912) and [loadSessionWithAuthRetry](../../src/acp/session/acpSessionBridge.ts#L914-L927) retry session setup after auth when the agent returns an auth-required error.

On dispose, [logoutBestEffort](../../src/acp/session/acpSessionBridge.ts#L929) calls [logout](../../src/acp/infrastructure/acpAgentProcess.ts#L241-L246) when the agent advertises logout support.

Task: [authentication](../tasks/auth.md).
Protocol: [authentication](../acp/protocol/v1/authentication.mdx).
