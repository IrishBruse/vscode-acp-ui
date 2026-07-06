# SDK Unstables

## User facing

This is a maintainer evaluation surface, not a user-visible feature.
It records which SDK unstable APIs ACP UI should adopt beyond what is already in use.

## Implementation

Already used: `unstable_setSessionModel`, `extMethod`, `extNotification`.

Candidates under review: `unstable_resumeSession`, `unstable_forkSession`, NES, document sync, elicitation, boolean `session.configOptions`.

Decisions are written in the task as adopt, defer, or reject.
New product features get their own feature doc when adopted.

Task: [sdk-unstables](../tasks/sdk-unstables.md).
