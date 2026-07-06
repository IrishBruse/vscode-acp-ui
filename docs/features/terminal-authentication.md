# Terminal Authentication

## User facing

Planned: some agents embed login command details in auth method metadata instead of using standard agent-type `authenticate`.
ACP UI will spawn an interactive login subprocess when that metadata is present.

Not shipped yet.
Today only agent-type `authenticate` is supported (see [authentication](./authentication.md)).

## Implementation

Not implemented.
The task covers `_meta.terminal-auth`, `auth.terminal` capability advertisement, and parsing `terminal-auth` meta on auth methods to spawn a login process.

Task: [terminal-auth](../tasks/terminal-auth.md).
Related: [client-capabilities](./client-capabilities.md), [authentication](./authentication.md).
