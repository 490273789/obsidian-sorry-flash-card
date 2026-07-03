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
