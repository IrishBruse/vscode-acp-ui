---
status: not-started
feature: docs/features/protocol-v2.md
---

# Task: Protocol v2 migration planning

## Deliverable

Track v2 RFCs and plan migration when `@agentclientprotocol/sdk` and target agents move to protocol version 2.
No v2 implementation until then.

## Why

`docs/acp/protocol/v2/` describes breaking changes:

- `auth/login` instead of `authenticate`
- `session/resume` emphasis over `session/load`
- JSON-RPC batch rules on transports
- Different prompt lifecycle (`state_update`, idle stop reasons)

ACP UI intentionally targets **v1 via SDK 0.18.2** (`PROTOCOL_VERSION = 1`) today.

## Implementation checklist

- [ ] Monitor SDK releases for v2 support and migration guide
- [ ] Review `docs/acp/rfds/` when planning a protocol bump
- [ ] Document breaking deltas in a migration note (when SDK signals v2)
- [ ] Schedule dedicated implementation epic (out of scope until SDK bump)

## Definition of done

1. Maintainers have a pointer to v2 docs and a trigger condition (SDK + agent adoption).
2. v1 alignment tasks ([README.md](./README.md)) remain the active workstream.

## References

- `docs/acp/protocol/v2/overview.mdx`
- `docs/acp/rfds/`
- `npm run sync:docs` to refresh cloned protocol tree
