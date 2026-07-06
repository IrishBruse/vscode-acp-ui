---
status: done
feature: docs/features/authentication.md
---

# Task: Authentication (`authenticate` / `logout`)

## Deliverable

After `initialize`, if the agent returns non-empty `authMethods`, call `authenticate` with a configurable `methodId` (default from agent or settings).
Support `logout` when the product needs to clear agent auth.

## Why

Agents that require an explicit post-`initialize` auth step fail when the client skips `authenticate`.
Cursor CLI often works pre-authenticated (`agent login` / env), but other agents do not.

## References

- `docs/acp/protocol/v1/authentication.mdx`
- `docs/cursor-extensions/acp.md` (recommended flow step 2)
- `src/acp/infrastructure/acpAgentProcess.ts`

## Checklist

- [x] Call `authenticate` when `authMethods` is non-empty after `initialize`
- [x] Support `logout` where product requires it
