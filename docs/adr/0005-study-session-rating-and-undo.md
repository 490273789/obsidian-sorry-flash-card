---
status: accepted
---

# Keep study session rating and undo semantics behind a pure module

学习会话 owns card queue creation, rating progression, answer-event counting, completion, and 撤销答题事件 semantics behind a pure in-process module. The module returns persistence intents for card scheduling state, study history, and deck study count; React and Obsidian adapters handle animation, confirmation, notices, and actual writes.

This deepens ADR-0002 without moving persistence behind the same seam. 撤销答题事件 restores the affected 卡片 to its scheduling state before the most recent 答题事件, rather than only moving the queue pointer back.
