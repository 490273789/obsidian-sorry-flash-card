# WSR Flash Card

This context describes the learning content model for the Obsidian flashcard plugin. The glossary keeps product language stable when discussing Markdown-backed decks and study flows.

## Language

**卡片**:
A single learnable item with a front, a back, and optional explanation.
_Avoid_: 题目, 问题项

**卡片身份**:
The stable identity used to carry a card's learning state when its 题库源文档 changes.
_Avoid_: index string, React key

**题库**:
A collection of cards that the learner studies as one source set.
_Avoid_: 卡组, deck cache

**题库源文档**:
The user-owned Markdown note that is the authority for a 题库's card content.
_Avoid_: deck file, source cache, parsed deck

**学习会话**:
A run through cards that updates the learner's spaced-repetition state.
_Avoid_: study component state, review UI state

**刷题会话**:
A self-test run through cards that records answers and produces a result without changing spaced-repetition state.
_Avoid_: practice component state, quiz UI state

**设置视图模型**:
The pure settings-page definition tree that describes labels, controls, visible state, help content, and semantic actions before Obsidian renders them.
_Avoid_: settings DOM, Obsidian Setting adapter

**题库索引**:
The derived set of parsed 题库 objects and discovered flashcard tags built from Markdown file snapshots during a vault sync.
_Avoid_: vault scan loop, saved plugin data
