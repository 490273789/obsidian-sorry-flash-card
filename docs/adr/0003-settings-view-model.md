---
status: accepted
---

# Keep settings definitions behind a pure view model

The settings page uses a pure 设置视图模型 to build the complete settings definition tree. The model receives a settings snapshot, discovered-tag state, loading state, and semantic actions, then returns labels, controls, help content, and action wiring without creating Obsidian `Setting` instances, DOM nodes, notices, or vault calls.

`FlashcardSettingTab` remains the Obsidian adapter. It loads available tags, owns `plugin.saveSettings()`, displays notices, renders the view model into Obsidian controls, and keeps the `display()` fallback path for environments where declarative settings definitions can produce a blank pane.

The first version is behavior-preserving. It does not add settings, remove settings, change copy, change tag refresh behavior, or remove the fallback renderer.
