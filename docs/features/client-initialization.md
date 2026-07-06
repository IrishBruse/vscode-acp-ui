# Client Initialization

## User facing

Planned: agents will receive `clientInfo` (name, version, title) on every `initialize` so they can identify the ACP UI build.
Users will see a clear message when protocol version negotiation fails.

Not shipped yet.

## Implementation

Not implemented.
`clientInfo` is omitted on `initialize` today.
The task adds fields from `package.json` and surfaces version mismatch errors.

Task: [initialization-metadata](../tasks/initialization-metadata.md).
Protocol: [initialization](../acp/protocol/v1/initialization.mdx).
