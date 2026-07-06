# Task docs

Tracked work items live under `docs/tasks/`.
Each task file links to the product feature it implements or will create.

## File layout

```
docs/tasks/
  AGENTS.md           # this file
  README.md           # index and implementation order
  <task-slug>.md      # one file per work item (kebab-case filename)
```

## Frontmatter

Every `docs/tasks/<task-slug>.md` file starts with YAML frontmatter:

```yaml
---
status: not-started   # done | in-progress | not-started
feature: docs/features/<feature-slug>.md
---
```

### `feature`

Path to the feature doc under `docs/features/`.
One feature file per user-visible or session-behavior surface.
Create `docs/features/<feature-slug>.md` when you add a task if it does not exist yet.
Follow [docs/features/AGENTS.md](../features/AGENTS.md) for feature doc structure.

When the task ships, update the linked feature doc (`## User facing` and `## Implementation`).
Do not duplicate long implementation detail in the task body after the feature doc is complete.

Planning-only tasks (no product surface) may omit `feature` or set it to a thin planning doc under `docs/features/`.

## Body sections

After frontmatter, use the same section order as today:

1. `# Task: ...` title
2. `## Deliverable`
3. `## Why` (when useful)
4. `## Current behavior` / `## Implementation` (as needed)
5. `## Implementation checklist` or `## Checklist`
6. `## Definition of done`
7. `## References`

Do not repeat `status` in the body.
That field lives only in frontmatter.

## Relation to other docs

| Location | Purpose |
| --- | --- |
| `docs/features/` | What ACP UI does (or will do) for users |
| `docs/tasks/` | Backlog and checklists |
| `docs/acp/` | Upstream ACP protocol reference |
