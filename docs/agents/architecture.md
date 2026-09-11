# Architecture Guide

Read this guide for plugin lifecycle, dependency ownership, or changes spanning more than one feature module. Read relevant accepted ADRs in `docs/adr/` before changing their decisions.

## Runtime composition

`src/obsidian/main.ts` is the composition root and nothing else. `FlashcardPlugin.onload()`:

1. Creates `DataStore` and loads persisted settings/data.
2. Creates the plugin-lifetime `AiService`.
3. Creates the `Workbench` (`src/obsidian/workbench.ts`) with the feature list from
   `src/obsidian/features/index.ts`, adds the host-owned AI engine settings section, registers
   the settings tab, and calls `workbench.refresh()`.

The settings document itself is composed from the feature-owned slices registered in
`src/settings/settingsSlices.ts` (ADR-0019), so the composition root never enumerates a slice.

`Workbench.refresh()` calls `render(host)` on every 工作台功能, then pushes committed settings
into every open view the workbench registered. The composition root owns only the settings
document, its write queue (`commitSettings(patch)`), the shared `AiService` and `DataStore`, and
the plugin lifecycle; it never names a feature's views, chrome, commands, or settings slice.

Each feature owns everything else it needs. `src/obsidian/features/flashcards.ts` constructs
`SessionLifecycle`, `CardIdentityContinuity`, `DeckHome`, and `PronunciationRuntime` on first
render and disposes them in `stop()`, because no other feature uses them; `AI 翻译` and `词典`
own their runtimes the same way. Shared services reach a feature through its factory in
`features/index.ts`, never through the host.

`src/obsidian/FlashcardView.tsx` mounts React and injects those services into `FlashcardApp`. Closing a view unmounts its React adapter and stops current pronunciation, but it does not itself end an active session. Plugin unload calls `workbench.dispose()`, which stops every feature before the shared `AiService` is disposed.

## Module ownership

| Area                | Primary modules                                                 | Owns                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench host      | `src/obsidian/workbench.ts`                                     | Feature registration, view registration and settings push, chrome lifetime, view activation, settings-patch commits, the settings-section registry                                                    |
| Workbench features  | `src/obsidian/features/`                                        | Per-feature runtime construction and disposal, views, ribbon/commands, settings sections, and feature-owned settings patches                                                                          |
| Obsidian boundary   | `src/obsidian/`                                                 | Plugin/view lifecycle, vault adapters, notices, settings rendering, identity modals                                                                                                                   |
| UI                  | `src/ui/`                                                       | Navigation drafts, rendering, keyboard events, modals, presentation timing adapters                                                                                                                   |
| Deck home           | `src/decks/deckHome.ts`                                         | Shared home snapshot, deck readiness, settings draft, refresh/migration/save/export activity, navigation revalidation, reorder persistence, word list visit recording, and read facades for deck data |
| Sessions            | `src/sessions/sessionLifecycle.ts`                              | The single idle/active/result lifecycle and durable transitions for study/practice/spelling                                                                                                           |
| Card continuity     | `src/identity/cardIdentityContinuity.ts`                        | Synchronization, migration, repair, source changes, stable card identity continuity                                                                                                                   |
| Persistence         | `src/storage/dataStore.ts`                                      | Unified plugin data, durable settings/session transitions, deck index state, revisions/subscriptions                                                                                                  |
| Settings document   | `src/settings/settingsSlices.ts`, `src/shared/settingsSlice.ts` | The slice registry and the composed settings document: defaults, normalization, and cloning for every owner                                                                                           |
| AI engines          | `src/ai/`                                                       | Named provider/model configurations, model discovery, text/image requests, credentials through an injected reader, and per-request timeout/cancellation                                               |
| Pronunciation       | `src/pronunciation/`                                            | Shared configuration snapshot, playback, providers, cancellation, cache and management activity                                                                                                       |
| Pure card logic     | `src/cards/`                                                    | Parsing, formatting, source mutation, spelling extraction/comparison                                                                                                                                  |
| Presentation models | `src/history/`, `src/wordList/`, `src/settings/`                | Pure display definitions, derived presentation state, and history retention pruning                                                                                                                   |
| Dictionary          | `src/dictionary/`                                               | Dictionary lookup, local compiled dictionaries, sandbox rendering, and the compiled-v2 package authority                                                                                              |

## Boundary rules

- Register Obsidian-facing commands and services in `src/obsidian/main.ts`; keep feature behavior in its domain module.
- 工作台功能 register through the workbench seam (`WorkbenchFeature.render(host)`) and reach Obsidian chrome only through `WorkbenchHost`. `main.ts` and `settingsTab.ts` must not name a feature's views, ribbon, commands, or settings slice: add a feature to `src/obsidian/features/index.ts` instead.
- A feature writes settings only through `host.updateSettings(patch)`. The host applies the patch to the settings committed at write time, so a queued write never resurrects a stale slice.
- A settings slice is the single authority for the keys it owns (ADR-0019). To add or change a slice, edit its owner's `SettingsSlice` descriptor and register it in `src/settings/settingsSlices.ts`; never add a branch to `DataStore`, and never read `DEFAULT_SETTINGS` from a normalizer. Slices must return exactly the keys they declare and must not overlap.
- 工作台功能 must not import one another. A primitive shared by two features belongs in a feature-independent location, not inside one feature's directory.
- React renders immutable snapshots and calls semantic actions. It must not coordinate persistence ordering or reach into raw engine state.
- `DeckHome`, `SessionLifecycle`, `CardIdentityContinuity`, and `PronunciationRuntime` are deep shared interfaces. Extend their semantic actions/snapshots instead of adding parallel state managers or pass-through wrappers.
- Pure engines, planners, builders, and presentation models must not import React or perform Obsidian I/O.
- `DataStore` publishes a monotonic revision after committed changes. Consumers subscribe rather than inventing manual refresh counters.
- Use `import type` for Obsidian-only or boundary-only types in pure modules and tests whenever runtime loading is unnecessary.

For new features that call AI, read [the internal AI service guide](../design/ai-engine-usage.md) for configuration selection, image input, and cancellation semantics.

## Architecture records

Use ADR status, not filename order, to decide what is current. Notable current decisions:

- ADR-0003: pure settings view model with an Obsidian rendering adapter.
- ADR-0004: pure deck index builder (superseded by ADR-0007).
- ADR-0005: study rating and true undo semantics.
- ADR-0007: stable card identity continuity; it supersedes ADR-0001 and ADR-0004.
- ADR-0008: unified `SessionLifecycle`; it supersedes the runtime-store shape described in ADR-0007.
- ADR-0009: pronunciation runtime owns committed pronunciation configuration.
- ADR-0010: one shared deep `DeckHome`.
- ADR-0011: one answer-presentation transition per mounted React adapter.
- ADR-0017: in-repo Rust/WASM dictionary engine, compiled-package authority, and dictionary source boundaries.
- ADR-0018: one workbench seam registers every 工作台功能; features never import one another.
- ADR-0019: the settings document is composed from feature-owned slices; each slice owns its defaults, normalization, and cloning.

When implementation and an accepted ADR disagree, surface the conflict rather than silently introducing a third model.
