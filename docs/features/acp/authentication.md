# Authentication

## User facing

ACP UI handles agent login during connect and session setup.

When you connect to an agent that requires login after startup, ACP UI runs the agent's auth flow automatically.
You do not need to pre-authenticate in a separate terminal for agents that advertise agent-type auth methods.

If auth fails, the chat shows a clear error with the method id and hints to run agent login or set `authMethodId` in settings.

Planned: some agents embed login command details in auth method metadata instead of using standard agent-type `authenticate`.
ACP UI will spawn an interactive login subprocess when that metadata is present.

## Implementation

### Agent-type authenticate

After `initialize`, [ensureAuthenticated](../../../src/acp/session/acpSessionBridge.ts#L880-L898) runs.
It calls [resolveAuthMethodId](../../../src/acp/domain/agentSpawnConfig.ts#L42-L68) on advertised `authMethods`.
When a method id is resolved, [authenticate](../../../src/acp/infrastructure/acpAgentProcess.ts#L230-L235) runs on the SDK connection.

[resolveAuthMethodId](../../../src/acp/domain/agentSpawnConfig.ts#L42-L68) prefers a configured `authMethodId` when it matches an agent-type method.
Otherwise it picks the first agent-type method.
Env-var and terminal auth methods are rejected with an explicit error.

[newSessionWithAuthRetry](../../../src/acp/session/acpSessionBridge.ts#L900-L912) retries session setup after auth errors.
[loadSessionWithAuthRetry](../../../src/acp/session/acpSessionBridge.ts#L914-L927) does the same for load.

On dispose, [logoutBestEffort](../../../src/acp/session/acpSessionBridge.ts#L929) runs.
It calls [logout](../../../src/acp/infrastructure/acpAgentProcess.ts#L241-L246) when logout is supported.

Task: [authentication](../../tasks/auth.md).
Protocol: [authentication](../../acp/protocol/v1/authentication.mdx).

### Terminal auth

Not implemented.
The task covers `_meta.terminal-auth`, `auth.terminal` capability advertisement, and parsing `terminal-auth` meta on auth methods to spawn a login process.

Task: [terminal-auth](../../tasks/terminal-auth.md).
Related: [client](./client.md).
