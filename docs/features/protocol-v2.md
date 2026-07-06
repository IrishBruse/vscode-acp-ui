# Protocol v2

## User facing

ACP UI targets ACP protocol v1 today.
v2 migration is tracked for maintainers only.
No user-facing v2 behavior until the SDK and target agents move to version 2.

## Implementation

`PROTOCOL_VERSION = 1` via SDK 0.18.2.
Breaking v2 deltas (auth/login, session/resume, batch rules, prompt lifecycle) are documented under `docs/acp/protocol/v2/`.

This feature doc is the planning anchor for the migration epic.
Implementation stays out of scope until an SDK bump.

Task: [protocol-v2](../tasks/protocol-v2.md).
Protocol: [v2 overview](../acp/protocol/v2/overview.mdx).
