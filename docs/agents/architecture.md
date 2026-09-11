# Architecture Guide

Read this guide for plugin lifecycle, dependency ownership, or changes spanning more than one feature module. Read relevant accepted ADRs in `docs/adr/` before changing their decisions.

## Runtime composition

`src/core/host/main.ts` is the composition root and nothing else. `FlashcardPlugin.onload()`:

1. Creates `DataStore` and loads persisted settings/data.
2. Creates the plugin-lifetime `AiService`.
3. Creates the `Workbench` (`src/core/host/workbench.ts`) with the feature list from
   `src/features/index.ts`, adds the host-owned AI engine settings section, registers
   the settings tab, and calls `workbench.refresh()`.

The settings document itself is composed from the feature-owned slices registered in
`src/core/host/settingsSlices.ts` (ADR-0019), so the composition root never enumerates a slice.

`Workbench.refresh()` calls `render(host)` on every 工作台功能, then pushes committed settings
into every open view the workbench registered. The composition root owns only the settings
document, its write queue (`commitSettings(patch)`), the shared `AiService` and `DataStore`, and
the plugin lifecycle; it never names a feature's views, chrome, commands, or settings slice.

Each feature owns everything else it needs. `src/features/flashcards/feature.tsx` constructs
`SessionLifecycle`, `CardIdentityContinuity`, `DeckHome`, and `PronunciationRuntime` on first
render and disposes them in `stop()`, because no other feature uses them; `AI 翻译` and `词典`
own their runtimes the same way. Shared services reach a feature through its factory in
`features/index.ts`, never through the host.

`src/core/host/reactItemView.tsx` mounts every view's React tree (ADR-0020) and injects the flashcard services into `FlashcardApp`. Closing a view unmounts its React adapter and stops current pronunciation, but it does not itself end an active session. Plugin unload calls `workbench.dispose()`, which stops every feature before the shared `AiService` is disposed.

## Source layout

The tree is sliced by 工作台功能, not by implementation layer (ADR-0021). A feature's domain, settings, strings, Obsidian adapters, and React views all live under one directory:

```text
src/
|-- core/                    # everything that is not one feature
|   |-- host/                # composition root (main.ts), workbench seam, view mount seam, settings tab, AI section, settings-slice registry
|   |-- settings/            # the SettingsSlice contract and the host slice
|   |-- storage/             # DataStore: the single writer of data.json
|   |-- ai/                  # shared AI engine service
|   |-- i18n/                # translator framework, shared strings, AI error strings
|   |-- shared/              # the settings document type plus generic helpers
|   |-- styles/              # SCSS entry and global layers
|   `-- ui/                  # primitives, i18n context, hooks shared by several features
|-- features/
|   |-- index.ts             # the only module that lists every feature
|   |-- flashcards/
|   |   |-- feature.tsx      # the slice's interface: the WorkbenchFeature
|   |   |-- domain/          # cards, decks, history, identity, pronunciation, sessions, wordList
|   |   |-- settings/        # slice descriptor, settings view model, study metadata
|   |   |-- strings/         # dictionary, typed useFlashcardI18n, practice-message defaults
|   |   |-- obsidian/        # continuity adapters and modals
|   |   `-- ui/              # FlashcardApp, its views, and its flashcard-only primitives
|   |-- translation/         # same layers: domain / settings / strings / obsidian / ui
|   `-- dictionary/          # same layers, plus the compiled-engine assets under domain/engine
`-- core/styles/index.scss   # the SCSS entry; feature styles are listed with feature paths
```

Read the layering inside a slice the same way as before: `domain/` and `settings/` are pure (`domain/**` never imports React or performs Obsidian I/O), `ui/` is React, `obsidian/` is the Obsidian adapter, and `feature.tsx` is the composition for that slice. Cross-slice imports are forbidden; a primitive shared by two features belongs in `src/core/`.

## Module ownership

| Area                | Primary modules                                                                                                            | Owns                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench host      | `src/core/host/workbench.ts`                                                                                               | Feature registration, view registration and settings push, chrome lifetime, view activation, settings-patch commits, the settings-section registry                                                    |
| Workbench features  | `src/features/`                                                                                                            | Per-feature runtime construction and disposal, views, ribbon/commands, settings sections, and feature-owned settings patches                                                                          |
| Obsidian boundary   | `src/core/host/`                                                                                                           | Plugin/view lifecycle, vault adapters, notices, settings rendering, identity modals                                                                                                                   |
| Shared UI           | `src/core/ui/`                                                                                                             | UI primitives, the i18n context, and hooks used by more than one feature                                                                                                                              |
| Deck home           | `src/features/flashcards/domain/decks/deckHome.ts`                                                                         | Shared home snapshot, deck readiness, settings draft, refresh/migration/save/export activity, navigation revalidation, reorder persistence, word list visit recording, and read facades for deck data |
| Sessions            | `src/features/flashcards/domain/sessions/sessionLifecycle.ts`                                                              | The single idle/active/result lifecycle and durable transitions for study/practice/spelling                                                                                                           |
| Card continuity     | `src/features/flashcards/domain/identity/cardIdentityContinuity.ts`                                                        | Synchronization, migration, repair, source changes, stable card identity continuity                                                                                                                   |
| Persistence         | `src/core/storage/dataStore.ts`                                                                                            | Unified plugin data, durable settings/session transitions, deck index state, revisions/subscriptions                                                                                                  |
| Settings document   | `src/core/host/settingsSlices.ts`, `src/core/settings/slice.ts`                                                            | The slice registry and the composed settings document: defaults, normalization, and cloning for every owner                                                                                           |
| Outbound port       | `src/core/net/`                                                                                                            | Request execution, status classification, deadline and cancellation, credential reads, and the single host-pinned exception (ADR-0024)                                                                |
| AI engines          | `src/core/ai/`                                                                                                             | Named provider/model configurations, model discovery, text/image requests, credentials through an injected reader, and per-request timeout/cancellation                                               |
| Pronunciation       | `src/features/flashcards/domain/pronunciation/`                                                                            | Shared configuration snapshot, playback, providers, cancellation, cache and management activity                                                                                                       |
| Pure card logic     | `src/features/flashcards/domain/cards/`                                                                                    | Parsing, formatting, source mutation, spelling extraction/comparison                                                                                                                                  |
| Presentation models | `src/features/flashcards/domain/history/`, `src/features/flashcards/domain/wordList/`, `src/features/flashcards/settings/` | Pure display definitions, derived presentation state, and history retention pruning                                                                                                                   |
| Flashcard strings   | `src/features/flashcards/strings/`                                                                                         | The 闪卡 dictionary (shared workbench strings merged with its own), the practice-message defaults, and the duration/rating formatters                                                                 |
| Dictionary          | `src/features/dictionary/domain/`                                                                                          | Dictionary lookup, local compiled dictionaries, sandbox rendering, and the compiled-v2 package authority                                                                                              |

## Boundary rules

- Register Obsidian-facing commands and services in `src/core/host/main.ts`; keep feature behavior in its domain module.
- 工作台功能 register through the workbench seam (`WorkbenchFeature.render(host)`) and reach Obsidian chrome only through `WorkbenchHost`. `main.ts` and `settingsTab.ts` must not name a feature's views, ribbon, commands, or settings slice: add a feature to `src/features/index.ts` instead.
- A feature declares its identity with `host.catalog(entry)` (title, icon, open command id, settings section, availability, how to open) and never adds its own ribbon: the workbench owns the entry point and the home list (ADR-0022). `host.chrome(...)` is only for commands specific to that feature.
- `Workbench.ring(build)` is the only place host-owned chrome is declared; it is rebuilt with every refresh so it relabels with the interface language.
- A feature writes settings only through `host.updateSettings(patch)`. The host applies the patch to the settings committed at write time, so a queued write never resurrects a stale slice.
- A settings slice is the single authority for the keys it owns (ADR-0019). To add or change a slice, edit its owner's `SettingsSlice` descriptor and register it in `src/core/host/settingsSlices.ts`; never add a branch to `DataStore`, and never read `DEFAULT_SETTINGS` from a normalizer. Slices must return exactly the keys they declare and must not overlap.
- 工作台功能 must not import one another. A primitive shared by two features belongs in `src/core/`, not inside one feature's directory (ADR-0021).
- Keep a feature's files inside its slice: domain, settings, strings, Obsidian adapters, and views all live under `src/features/<id>/`. Only cross-feature infrastructure belongs in `src/core/`.
- Views are declared with `createReactItemView` (ADR-0020), never as hand-written `ItemView` subclasses: the seam owns the mount lifecycle and the error boundary, and always renders the committed settings. `updateSettings` is the host's push signal, not a settings source.
- React renders immutable snapshots and calls semantic actions. It must not coordinate persistence ordering or reach into raw engine state.
- `DeckHome`, `SessionLifecycle`, `CardIdentityContinuity`, and `PronunciationRuntime` are deep shared interfaces. Extend their semantic actions/snapshots instead of adding parallel state managers or pass-through wrappers.
- Pure engines, planners, builders, and presentation models must not import React or perform Obsidian I/O.
- `DataStore` publishes a monotonic revision after committed changes. Consumers subscribe rather than inventing manual refresh counters.
- Outbound work goes through the outbound port: do not call `requestUrl`, `fetch`, or `secretStorage.getSecret` from a feature. A raw host-pinned fetch is the single sanctioned exception and lives behind `requestHostPinned` (ADR-0024).
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
- ADR-0020: one React mount seam (`createReactItemView`) builds every workbench view.
- ADR-0021: the source tree is sliced by 工作台功能; `src/core/` holds everything that is not one feature.
- ADR-0022: the workbench owns the single entry point (ribbon + 工作台首页); features declare identity through the catalog.
- ADR-0023: one layout module (`.fc-page*` / `.fc-panel*`) owns every view's page shell and panels.
- ADR-0024: one outbound port (`src/core/net/`) owns requests, credentials, and transport error classification.

When implementation and an accepted ADR disagree, surface the conflict rather than silently introducing a third model.
