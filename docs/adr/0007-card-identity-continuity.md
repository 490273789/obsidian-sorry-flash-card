---
status: accepted
---

# Keep card identity continuity behind a deep workflow module

Positional card IDs cannot preserve learning state when users edit, reorder, or move cards directly in 题库源文档, and the current delete path leaks identity mappings and ordering constraints across `DataStore`, React, and both session runtimes. We will put 卡片身份连续性 behind a deep `CardIdentityContinuity` module whose caller-oriented interface is `synchronize()`, `change()`, `inspect()`, and `resolve()`; the module owns persistence sequencing while the pure source editor, session transitions, and 题库索引 builder remain internal seams.

## Identity semantics

- Every migrated or registered card has a vault-wide UUID stored immediately before its front content as `<!-- wsr-card-id: UUID -->`.
- The UUID, not file position or content similarity, carries 卡片身份 and FSRS state through content edits, reordering, and moves between 题库. 题库 identity remains file-path based.
- `synchronize()` builds a vault-wide identity view at the existing sync points. It may register an unambiguously new unmarked card, but it never falls back to positional matching for legacy cards.
- Duplicate UUIDs produce 卡片身份冲突. A missing previous identity together with an unmarked current card produces 卡片身份歧义. The module does not guess a successor.
- Affected 题库源文档 retain their last-known-good 题库 state until the user performs 卡片身份修复; unaffected 题库 continue syncing. Conflicted 题库 remain available for study and rating, but plugin-initiated source edits are blocked.
- Repair explicitly assigns each previous identity to one current card or to no successor. Unassigned current cards receive new identities and fresh learning state.

## Migration and recovery

- 卡片身份迁移 is explicit, previewed with affected source and card counts, and cannot start while a 学习会话 or 刷题会话 is active. New 题库 with no prior learning state use normal card registration instead.
- Before changing Markdown, the module persists a resumable journal containing old-to-new identity mappings and per-source progress. A journal failure causes no source writes.
- Source writes are atomic per 题库源文档 and guarded by a fresh-content check. Concurrent edits are never overwritten. Successful migration files remain migrated when another file fails; later runs resume pending work.
- Multi-source repair does not publish a partial 题库索引 or session state. All affected 题库 remain last-known-good until every planned source write succeeds; an interrupted repair resumes from its journal.
- Mutating operations are single-writer and always recover an unfinished journal first. Expected attention, blocking, concurrency, and I/O cases return typed outcomes; only broken internal invariants throw.

## Session semantics

- Active sessions move from React-local ownership into a subscribable in-process runtime store. React renders snapshots; `CardIdentityContinuity` coordinates sessions through an internal adapter and never returns `CardIdMap` to callers.
- 会话卡片集 is fixed by identity at session start. Edited and moved identities remain, deleted identities leave current and future queues, and new identities do not enter.
- 答题事件 already produced by a deleted card remain in session history and statistics, but the deleted card cannot be undone, retried, or included in an incorrect-card retry.
- Removing every remaining identity produces 源文档变更结束. Existing answer activity is saved without incrementing normal completion counts or showing normal completion treatment; zero-answer sessions create no 学习记录.
- 学习记录 retains the 题库 identity and name snapshot from session start, even when cards move during the session.

## Consequences

- `DataStore` becomes an implementation-private persistence adapter. Its caller-facing sync and card-source mutation methods are replaced rather than kept as pass-through paths.
- Obsidian and React adapters own notices, confirmation, localization, and repair presentation. They receive typed outcomes and opaque preview or repair tickets, never write plans or identity graphs.
- Production uses Obsidian Vault, persistence, and active-session adapters; tests use in-memory adapters at the same internal seams. Primary behavior tests cross the `CardIdentityContinuity` interface and assert final Markdown, learning state, 题库索引, journal recovery, and session outcomes.
- This ADR supersedes ADR-0001. It retains the pure 题库源文档 editor but replaces the positional identity rule and moves end-to-end workflow ordering out of `DataStore` and behind `CardIdentityContinuity`.
