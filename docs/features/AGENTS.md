# Feature docs

Shipped and in-progress product features are documented under `docs/features/`.
Each feature gets one markdown file.

## File layout

```
docs/features/
  AGENTS.md                 # this file — the pattern for feature docs
  <feature-slug>.md         # one file per feature (kebab-case filename)
```

Use a kebab-case slug for the filename (for example `composer-autocomplete.md`, `session-resume.md`).
Do not nest feature content in subdirectories.

## Document structure

Every `docs/features/<feature-slug>.md` file uses the same section order:

1. **`# Feature name`** — human-readable title at the top.
   Use title case or sentence case.
   Do not repeat the kebab-case slug in the heading.

2. **`## User facing`** — what the feature does for someone using ACP UI.
   Write as a short user story or product explanation: who it helps, what they can do, and what they see.
   Avoid file paths, type names, and protocol field names here unless the user would recognize them in the UI.

3. **`## Implementation`** — how the extension implements the feature.
   Cover data flow, key modules, protocol messages, state, and edge cases.
   Link to ACP protocol docs under `docs/acp/` when the feature maps to a spec surface.

Put user-facing content first.
Keep implementation detail under `## Implementation` only.

### Linking source from `## Implementation`

Do not list bare `` `path/file.ts` `` or `` `methodName` `` references.
Link to the exact file and line range instead.

Use relative markdown links from `docs/features/` (two levels up to the repo root):

```markdown
[buildComposerAutocompleteState](../../webview/acp-ui/src/components/composerAutocomplete.ts#L85-L124)
```

Rules:

- **Link text** — symbol name, type name, or a short label (not the full path).
- **Target** — `../../<path-from-repo-root>#L<start>-L<end>` for a range, or `#L<line>` for one line.
- **Ranges** — span the function, case arm, or block you are describing.
  Re-check line numbers when the linked code moves.
- **Protocol docs** — link under `../acp/...` the same way (no line anchor when the synced doc has no stable lines).

Example implementation paragraph:

```markdown
[buildComposerAutocompleteState](../../webview/acp-ui/src/components/composerAutocomplete.ts#L85-L124)
calls [queryFromCaret](../../webview/acp-ui/src/components/composerAutocomplete.ts#L33-L43)
to detect `/` and `@` tokens at the caret.
```

Do not wrap link text in backticks.
Use `[symbol](path#L10-L20)`, not `` [`symbol`](path#L10-L20) ``.

## When to add or update a feature doc

Add `docs/features/<feature-slug>.md` when a feature is user-visible or materially changes chat/session behavior.
Update the same file when behavior changes.
Do not split user and implementation into separate files.

## Relation to other docs

| Location | Purpose |
| --- | --- |
| `docs/features/` | Product features: user story plus implementation in one file |
| `docs/tasks/` | Tracked work items and backlog |
| `docs/acp/` | Upstream ACP protocol reference (synced) |

Feature docs describe what ACP UI does.
Task docs describe what is left to do.
ACP docs describe the protocol contract.

Each task under `docs/tasks/` links back via YAML frontmatter `feature: docs/features/<slug>.md`.
Create or update the feature doc when you add or ship a task.
See [docs/tasks/AGENTS.md](../tasks/AGENTS.md).

## Example skeleton

```markdown
# My Feature

## User facing

Short explanation of what the user gets.

## Implementation

[myHandler](../../src/myHandler.ts#L10-L40) does the work.
See [myHandler.test.ts](../../src/myHandler.test.ts#L1-L20).
Protocol: [my protocol surface](../acp/protocol/v2/my-feature.mdx).
```
