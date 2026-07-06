# Feature docs

Shipped and in-progress product features are documented under `docs/features/`.
Each file describes a **combined high-level feature**, not a single task.

## File layout

```
docs/features/
  AGENTS.md                 # this file — the pattern for feature docs
  <feature-slug>.md         # one file per high-level feature (kebab-case filename)
```

Use a kebab-case slug for the filename (for example `sessions.md`, `composer.md`).
Do not nest feature content in subdirectories.

Several tasks may link to the same feature doc.
Group related work under one feature instead of creating a 1:1 task-to-feature mapping.

## Document structure

Every `docs/features/<feature-slug>.md` file uses the same section order:

1. **`# Feature name`** — human-readable title at the top.
   Use title case or sentence case.
   Do not repeat the kebab-case slug in the heading.

2. **`## User facing`** — what the feature does for someone using ACP UI.
   Write as a short user story or product explanation: who it helps, what they can do, and what they see.
   Cover the whole feature area, including planned parts not yet shipped.
   Avoid file paths, type names, and protocol field names here unless the user would recognize them in the UI.

3. **`## Implementation`** — how the extension implements the feature.
   Use `###` subsections when the feature spans multiple tasks or protocol surfaces.
   Cover data flow, key modules, protocol messages, state, and edge cases.
   Link to ACP protocol docs under `docs/acp/` when the feature maps to a spec surface.
   Link to related tasks under `docs/tasks/` at the end of each subsection when useful.

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

Add or extend a feature doc when a user-visible or session-behavior surface ships or changes materially.
Prefer updating an existing high-level feature over adding a new file for every task.

Add a new feature file only when the work is a distinct product area that does not fit an existing doc.

Do not split user and implementation into separate files.

## Relation to other docs

| Location | Purpose |
| --- | --- |
| `docs/features/` | Combined product features: user story plus implementation |
| `docs/tasks/` | Tracked work items and backlog (many tasks, fewer features) |
| `docs/acp/` | Upstream ACP protocol reference (synced) |

Feature docs describe what ACP UI does at a high level.
Task docs describe specific deliverables and checklists.
ACP docs describe the protocol contract.

Each task under `docs/tasks/` links back via YAML frontmatter `feature: docs/features/<slug>.md`.
Create or update the feature doc when you add or ship a task.
See [docs/tasks/AGENTS.md](../tasks/AGENTS.md).

## Example skeleton

```markdown
# My Feature

## User facing

Short explanation of what the user gets across related tasks.

## Implementation

### Area one

[myHandler](../../src/myHandler.ts#L10-L40) does the work.
Task: [my-task](../tasks/my-task.md).

### Area two

Planned behavior and protocol links.
Task: [other-task](../tasks/other-task.md).
```
