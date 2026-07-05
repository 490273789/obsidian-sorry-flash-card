---
status: accepted
---

# Keep session state transitions behind a pure module

学习会话 and 刷题会话 state transitions live behind a pure in-process module that takes the current session plus a user action and returns the next session or completion result. React modules remain adapters for rendering, keyboard events, animation timing, and persistence side effects such as saving FSRS updates or study history.

We deliberately do not put React hooks, Obsidian calls, or FSRS persistence inside the session module. The module owns queue progression, previous-card behavior, practice result calculation, practice session creation from card IDs, and remapping session card references after 卡片身份 changes.

刷题选题和排队由纯 planner 产生 `PracticeSessionPlan`; the session runner turns that plan into runtime `PracticeSession` state and continues to own answer progression, previous-card behavior, completion results, and remapping after 卡片身份 changes.
