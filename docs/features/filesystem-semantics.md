# Filesystem Semantics

## User facing

Planned: when an agent reads or writes files through ACP UI, behavior will match protocol expectations more closely.
That includes reading unsaved editor buffers, honoring line/limit partial reads, and configurable handling of missing files.

Today reads use on-disk content only and ignore line/limit.

## Implementation

[handleReadTextFile](../../src/acp/infrastructure/acpAgentProcess.ts) and [handleWriteTextFile](../../src/acp/infrastructure/acpAgentProcess.ts) implement the client filesystem callbacks.
Gaps: open document buffers, `line`/`limit` params, and ENOENT returns empty string as a Gemini CLI workaround.

Task: [filesystem-semantics](../tasks/filesystem-semantics.md).
Protocol: [file system](../acp/protocol/v1/file-system.mdx).
