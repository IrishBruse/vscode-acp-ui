# Platform

## User facing

This area covers maintainer-facing protocol and SDK evolution, not end-user product surfaces.

ACP UI targets ACP protocol v1 today.
v2 migration is tracked for maintainers only.
No user-facing v2 behavior until the SDK and target agents move to version 2.

## Implementation

### Protocol v2

`PROTOCOL_VERSION = 1` via SDK 0.18.2.
Breaking v2 deltas (auth/login, session/resume, batch rules, prompt lifecycle) are documented under `docs/acp/protocol/v2/`.

Implementation stays out of scope until an SDK bump.

Task: [protocol-v2](../tasks/protocol-v2.md).
Protocol: [v2 overview](../acp/protocol/v2/overview.mdx).

### SDK unstables

Already used: `unstable_setSessionModel`, `extMethod`, `extNotification`.

Candidates under review: `unstable_resumeSession`, `unstable_forkSession`, NES, document sync, elicitation, boolean `session.configOptions`.

Decisions are written in the task as adopt, defer, or reject.
Adopted APIs surface in the relevant product feature doc.

Task: [sdk-unstables](../tasks/sdk-unstables.md).
