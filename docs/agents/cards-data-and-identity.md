# Cards, Data, and Identity Guide

Read this guide before changing Markdown card syntax, parsing, indexing, card source edits, persistence, migrations, or stable identities.

## Source and persistence authority

- The user's Markdown notes are authoritative for card content.
- A deck ID is its source file path. Changing this affects persisted deck settings, history, and learning state.
- `DataStore` owns the unified persisted document: settings, derived deck cache, study history, spelling progress, discovered tags, FSRS state, and card-identity continuity state.
- Persist through `DataStore.saveSettings()`, `DataStore.save()`, or its atomic session/continuity adapters. Do not add independent plugin-data writes.
- Preserve backward-compatible normalization in `loadSettings()`, including legacy `flashcardTag` to `flashcardTags` migration.
- Preserve FSRS card state when reparsing or rebuilding a deck index.

## Card format and indexing

`src/cards/parser.ts` and `src/cards/cardFormat.ts` define the format:

- The first hashtag in a Markdown file identifies its deck tag; matching supports Chinese characters and is case-insensitive against configured tags.
- `??` on its own line separates front and back.
- Optional explanation begins after `::` on its own line.
- `;;` on its own line ends a card.
- A stable identity marker immediately before the front is `<!-- wsr-card-id: <uuid> -->`.
- Legacy cards without a marker may still parse with `${filePath}::${index}`, but continuity workflows must not treat that positional ID as a stable migrated identity.

Vault scanning reads file snapshots in the Obsidian adapter and passes them to the pure `src/cards/deckIndexBuilder.ts`. Keep file I/O out of the builder. Per-file failures must not prevent unaffected sources from being indexed.

## Stable identity and source edits

- A vault-wide UUID carries card identity and learning state across content edits, reorder, and moves between decks.
- Never copy marker syntax into feature code. Use `src/cards/cardFormat.ts` and `src/cards/deckSourceEditor.ts`.
- Route plugin-initiated card add/edit/delete actions through `CardIdentityContinuity.change()`; do not mutate Markdown and then patch persisted cards separately.
- Synchronization, explicit legacy migration, duplicate repair, ambiguous successor resolution, resumable journals, and session reconciliation belong to `src/identity/cardIdentityContinuity.ts`.
- Do not guess identity successors from content similarity or position. Conflicts and ambiguities require the existing explicit repair workflow.
- Affected sources retain their last-known-good deck state until repair completes. Preserve fresh-content checks, per-source atomic writes, single-writer behavior, and resumable recovery.
- Pronunciation secret values never belong in persisted plugin data. Only `SecretStorage` IDs may appear in settings.

## High-risk files and tests

Treat these files as compatibility boundaries:

- `src/storage/dataStore.ts`
- `src/cards/parser.ts`
- `src/cards/cardFormat.ts`
- `src/cards/deckSourceEditor.ts`
- `src/cards/deckIndexBuilder.ts`
- `src/identity/cardIdentityContinuity.ts`
- `src/obsidian/cardIdentityContinuityAdapters.ts`

Add or update focused tests under `src/cards/__tests__/`, `src/storage/__tests__/`, `src/identity/__tests__/`, and `src/obsidian/__tests__/` as applicable. Test final Markdown, identity/state preservation, recovery behavior, and unaffected-source behavior—not only helper return values.
