# Multimodal Prompts

## User facing

Planned: send images, audio, and structured file references in prompts when the agent advertises multimodal `promptCapabilities`.
Composer `@` file mentions will become structured ACP `resource` blocks instead of plain path text in the draft.

Today prompts are a single text block.

## Implementation

Not implemented.
[prompt](../../src/acp/infrastructure/acpAgentProcess.ts) assembles text-only content today.
Composer `@` mentions are handled as text inserts (see [composer-autocomplete](./composer-autocomplete.md) for mention UI).

Task: [multimodal-prompts](../tasks/multimodal-prompts.md).
Protocol: [prompt turn](../acp/protocol/v1/prompt-turn.mdx).
