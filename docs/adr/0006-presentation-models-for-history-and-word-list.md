---
status: accepted
---

# Keep history and word-list presentation behind pure models

学习记录 and 单词表 views use pure presentation models for grouping, ordering, display labels, column metadata, and virtual-row layout. React components remain adapters for rendering, local interaction state, measurement, scrolling, and Obsidian-root portals, so display rules can be tested through a small interface without mounting the UI.
