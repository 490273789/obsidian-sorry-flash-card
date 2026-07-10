# WSR Flash Card

This context describes the learning content model for the Obsidian flashcard plugin. The glossary keeps product language stable when discussing Markdown-backed decks and study flows.

## Language

**卡片**:
A single learnable item with a front, a back, and optional explanation.
_Avoid_: 题目, 问题项

**卡片身份**:
The stable identity used to carry a card's learning state when its 题库源文档 changes.
_Avoid_: index string, React key

**卡片身份连续性**:
The guarantee that the same card retains its 卡片身份 and learning state across 题库源文档变更 whenever the successor is unambiguous; conflicts require 卡片身份修复.
_Avoid_: ID remapping, positional persistence

**卡片身份标记**:
A vault-wide unique identifier stored with a card in its 题库源文档 so the same card can be recognized after content edits, reordering, or moving between 题库.
_Avoid_: card position, content fingerprint

**卡片身份迁移**:
An explicit one-time assignment of 卡片身份标记 to legacy cards while preserving their existing learning state.
_Avoid_: automatic sync rewrite, silent migration

**卡片身份注册**:
The first assignment of a new 卡片身份标记 to an unambiguously new card added to a migrated 题库源文档.
_Avoid_: legacy migration, heuristic matching

**卡片身份冲突**:
A state where more than one card claims the same 卡片身份标记, so the learner's existing learning state cannot be assigned safely without an explicit choice.
_Avoid_: duplicate card, automatic winner

**卡片身份歧义**:
A state where a previous 卡片身份 disappears while an unmarked card appears, leaving it unclear whether the learner edited the same card or replaced it with a new one.
_Avoid_: automatic content match, assumed replacement

**卡片身份修复**:
An explicit choice that assigns a previous 卡片身份 and its learning state to one current card, or confirms that the previous card has no successor; remaining unassigned cards receive new identities.
_Avoid_: automatic conflict resolution, content similarity guess

**题库源文档变更**:
A user change to a 题库源文档, including additions, removals, edits, reordering, and moving cards between 题库; a card that remains the same learnable item retains its 卡片身份 across the change.
_Avoid_: vault sync, Markdown diff

**题库**:
A collection of cards that the learner studies as one source set.
_Avoid_: 卡组, deck cache

**题库源文档**:
The user-owned Markdown note that is the authority for a 题库's card content.
_Avoid_: deck file, source cache, parsed deck

**学习会话**:
A run through cards that updates the learner's spaced-repetition state.
_Avoid_: study component state, review UI state

**会话卡片集**:
The card identities selected when a 学习会话 or 刷题会话 begins; content edits and 题库 moves do not reselect it, while deleted identities leave it and newly added identities do not enter it.
_Avoid_: live deck contents, current card array

**答题事件**:
A learner action that grades or answers one card occurrence during a 学习会话 or 刷题会话. It remains part of session history after the card is deleted, and repeated occurrences of the same 卡片 count as separate 答题事件.
_Avoid_: unique card count, current index

**撤销答题事件**:
Returning a 学习会话 to the state before its most recent 答题事件, including restoring the affected 卡片 scheduling state.
_Avoid_: previous button, queue-only back

**源文档变更结束**:
The end of a 学习会话 or 刷题会话 caused by a 题库源文档变更 removing every remaining card identity. Completed 答题事件 are recorded, but the session is not treated as normally completed.
_Avoid_: successful completion, abandoned session

**刷题会话**:
A self-test run through cards that records answers and produces a result without changing spaced-repetition state.
_Avoid_: practice component state, quiz UI state

**学习记录**:
A saved summary of learning activity for a 题库 on a local date. Its 题库 identity and name come from the snapshot at session start, even if cards move during the session.
_Avoid_: stats row, history UI item

**单词表**:
A browsable presentation of the 卡片 in one 题库 for checking front, back, and explanation content without changing learning state.
_Avoid_: word list component, deck preview

**设置视图模型**:
The pure settings-page definition tree that describes labels, controls, visible state, help content, and semantic actions before Obsidian renders them.
_Avoid_: settings DOM, Obsidian Setting adapter

**题库索引**:
The derived set of parsed 题库 objects and discovered flashcard tags built from Markdown file snapshots during a vault sync.
_Avoid_: vault scan loop, saved plugin data
