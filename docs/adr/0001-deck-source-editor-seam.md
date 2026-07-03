---
status: accepted
---

# Keep deck source editing behind a pure in-process module

Card add, update, and delete operations must edit the user's 题库源文档 through a pure in-process module that takes Markdown content plus the current 题库 state and returns the next Markdown content plus 卡片身份 mappings. `DataStore` remains the Obsidian adapter and persistence module: it reads and writes vault files, saves plugin data, and calls the parser again so existing FSRS state can be preserved.

We deliberately do not put Obsidian file reads or writes inside the source-edit module. We also keep the current `${filePath}::${index}` card ID rule for now and concentrate the resulting remap complexity behind this module instead of coupling React UI code to that rule.
