# Filesystem

## User facing

When an agent reads or writes files through ACP UI, behavior will match protocol expectations more closely.
That includes reading unsaved editor buffers, honoring line/limit partial reads, and configurable handling of missing files.

Today reads use on-disk content only and ignore line/limit.

## Implementation

[handleReadTextFile](../../../src/acp/infrastructure/acpAgentProcess.ts) implements read callbacks.
[handleWriteTextFile](../../../src/acp/infrastructure/acpAgentProcess.ts) implements write callbacks.
Gaps include open document buffers and `line`/`limit` params.
ENOENT returns empty string as a Gemini CLI workaround.

Task: [filesystem-semantics](../../tasks/filesystem-semantics.md).
Protocol: [file system](../../acp/protocol/v1/file-system.mdx).
