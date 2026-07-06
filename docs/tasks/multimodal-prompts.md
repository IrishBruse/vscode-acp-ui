---
status: not-started
feature: docs/features/composer.md
---

# Task: Multimodal prompts and structured `@` mentions

## Deliverable

1. Send multimodal `session/prompt` content (`image`, `audio`, `resource`, embedded context) when the agent advertises `promptCapabilities`.
2. Send structured `resource` blocks for composer `@` file mentions instead of only inserting paths into draft text.

## Why

Prompts are text-only today: `[{ type: "text", text }]`.
Agents with multimodal capabilities cannot receive images, audio, or structured file references from ACP UI.

## Current behavior

| Area | Today |
| --- | --- |
| `session/prompt` | Single text block |
| Composer `@` mentions | Paths inserted into draft string |

## Key files

| Path | Role |
| --- | --- |
| `src/acp/infrastructure/acpAgentProcess.ts` | `prompt()` content assembly |
| `src/acp/session/acpSessionBridge.ts` | Send path from composer |
| `webview/acp-ui/src/components/ChatComposer.tsx` | Mentions UI |

## Implementation checklist

- [ ] Read agent `promptCapabilities` after `session/new` or `initialize`
- [ ] Build prompt content array from composer (text + attachments)
- [ ] Map `@` file picks to `resource` blocks per v1 content schema
- [ ] Support image/audio attach when capability allows (product UI TBD)
- [ ] Graceful fallback to text-only for agents without capabilities
- [ ] Tests for content assembly
- [ ] `npm run verify` passes

## Definition of done

1. File mentions in the composer produce structured ACP content when supported.
2. At least one multimodal type (e.g. `resource` or `image`) works end-to-end with a capable agent.

## References

- `docs/acp/protocol/v1/prompt-turn.mdx`
- `docs/acp/schema/v1/schema.json` (content types)
