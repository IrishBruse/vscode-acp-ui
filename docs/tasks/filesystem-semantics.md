---
status: not-started
feature: docs/features/filesystem-semantics.md
---

# Task: Filesystem semantics

## Deliverable

Align `readTextFile` / `writeTextFile` client callbacks with v1 filesystem expectations where practical.

| Gap | Docs | Today |
| --- | --- | --- |
| Unsaved buffers | Read should reflect editor state | `workspace.fs.readFile` (on-disk only) |
| Partial read | `line` / `limit` optional params | Ignored, port is `readTextFile(path)` only |
| Missing file | Error response | Returns `{ content: "" }` for `ENOENT` (Gemini CLI workaround) |

## Why

Agents editing unsaved buffers or requesting line ranges get wrong or full-file content.
ENOENT empty-string is intentional for some agents but diverges from spec.

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `handleReadTextFile`, `handleWriteTextFile` |

## Implementation checklist

- [ ] **Unsaved buffers:** prefer open document `TextDocument` content when path matches active editor
- [ ] **`line` / `limit`:** extend handler signature and slice content per v1 schema
- [ ] **ENOENT:** product decision documented, with optional setting to toggle empty-string vs error
- [ ] Tests for buffer read, partial read, ENOENT modes
- [ ] `npm run verify` passes

## Definition of done

1. Reading a file open with unsaved edits returns editor buffer content.
2. `line` / `limit` honored when agent sends them.
3. ENOENT behavior is documented and configurable or spec-aligned per decision.

## References

- `docs/acp/protocol/v1/file-system.mdx`
