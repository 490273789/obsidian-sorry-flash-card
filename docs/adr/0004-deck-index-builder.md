---
status: accepted
---

# Keep deck indexing behind a pure builder

Vault-wide sync uses a pure builder to turn already-read Markdown file snapshots into a 题库索引. The builder receives file path, basename, content, configured tags, and optional existing deck state, then returns the next deck map, discovered flashcard tags, and file-level build errors.

`DataStore.syncFromVault()` remains the Obsidian adapter. It reads files from the vault, logs per-file failures, applies the builder result, and saves plugin data. Card parsing, card IDs, and FSRS-state preservation continue to follow the existing parser contract.

The first version keeps full-scan behavior. It does not introduce incremental indexing, file watchers, new identity rules, or new persistence timing.
