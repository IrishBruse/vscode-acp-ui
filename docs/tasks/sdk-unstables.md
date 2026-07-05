# Task: SDK unstables evaluation

**Status:** Not started  
**Priority:** P3  
**Owner:** unassigned  
**Source:** `docs/ACP_DIVERGENCE_REPORT.md`

## Deliverable

Evaluate whether ACP UI should adopt additional SDK unstable APIs beyond those already in use.

## Already used

| API | Use |
| --- | --- |
| `unstable_setSessionModel` | Model picker after `session/new` |
| `extMethod` / `extNotification` | Cursor `cursor/*` methods |

## Candidates to evaluate

| API | Notes |
| --- | --- |
| `unstable_resumeSession` | Overlap with stable `session/load` |
| `unstable_forkSession` | See `docs/acp/rfds/session-fork.mdx` |
| NES (next edit suggestions) | See `docs/acp/rfds/next-edit-suggestions.mdx` |
| Document sync | SDK extension surface |
| `elicitation` (form + url) | Zed advertises when `AcpBetaFeatureFlag` is on, needs client UI ([client-capabilities.md](./client-capabilities.md)) |
| `session.configOptions.boolean` | Zed beta flag, composer UI ready, capability not advertised ([client-capabilities.md](./client-capabilities.md)) |

## Implementation checklist

- [ ] Read SDK release notes and unstable method docs for `@agentclientprotocol/sdk`
- [ ] For each candidate: user value, agent support, overlap with stable v1
- [ ] Write short decision (adopt / defer / reject) in this file or changelog
- [ ] If adopting: separate implementation tasks filed

## Definition of done

1. Written recommendation for each listed unstable API.
2. No code required unless evaluation recommends adoption (then spin follow-up tasks).

## References

- `docs/ACP_DIVERGENCE_REPORT.md` (Unstable / SDK-only APIs)
- `docs/acp/rfds/`
