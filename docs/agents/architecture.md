# Architecture Guide

Read this guide for plugin lifecycle, dependency ownership, or changes spanning more than one feature module. Read relevant accepted ADRs in `docs/adr/` before changing their decisions.

## Runtime composition

`src/obsidian/main.ts` is the composition root. `FlashcardPlugin.onload()`:

1. Creates `DataStore` and loads persisted settings/data.
2. Creates the plugin-lifetime `PronunciationRuntime`.
3. Creates `SessionLifecycle` and its narrow continuity adapter.
4. Creates `CardIdentityContinuity` with Obsidian source and persisted-state adapters.
5. Creates the shared plugin-lifetime `DeckHome`.
6. Registers the view, commands, ribbon icon, and settings tab.

`src/obsidian/FlashcardView.tsx` mounts React and injects these shared services into `FlashcardApp`. Closing a view unmounts its React adapter and stops current pronunciation, but it does not itself end an active session. Plugin unload disposes deck-home timers and pronunciation resources.

## Module ownership

| Area                | Primary modules                                  | Owns                                                                                                                                       |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Obsidian boundary   | `src/obsidian/`                                  | Plugin/view lifecycle, vault adapters, commands, notices, settings rendering, identity modals                                              |
| UI                  | `src/ui/`                                        | Navigation drafts, rendering, keyboard events, modals, presentation timing adapters                                                        |
| Deck home           | `src/decks/deckHome.ts`                          | Shared home snapshot, deck readiness, settings draft, refresh/migration/save/export activity, navigation revalidation, reorder persistence |
| Sessions            | `src/sessions/sessionLifecycle.ts`               | The single idle/active/result lifecycle and durable transitions for study/practice/spelling                                                |
| Card continuity     | `src/identity/cardIdentityContinuity.ts`         | Synchronization, migration, repair, source changes, stable card identity continuity                                                        |
| Persistence         | `src/storage/dataStore.ts`                       | Unified plugin data, durable settings/session transitions, deck index state, revisions/subscriptions                                       |
| Pronunciation       | `src/pronunciation/`                             | Shared configuration snapshot, playback, providers, cancellation, cache and management activity                                            |
| Pure card logic     | `src/cards/`                                     | Parsing, formatting, source mutation, spelling extraction/comparison                                                                       |
| Presentation models | `src/history/`, `src/wordList/`, `src/settings/` | Pure display definitions, derived presentation state, and history retention pruning                                                        |

## Boundary rules

- Register Obsidian-facing commands and services in `src/obsidian/main.ts`; keep feature behavior in its domain module.
- React renders immutable snapshots and calls semantic actions. It must not coordinate persistence ordering or reach into raw engine state.
- `DeckHome`, `SessionLifecycle`, `CardIdentityContinuity`, and `PronunciationRuntime` are deep shared interfaces. Extend their semantic actions/snapshots instead of adding parallel state managers or pass-through wrappers.
- Pure engines, planners, builders, and presentation models must not import React or perform Obsidian I/O.
- `DataStore` publishes a monotonic revision after committed changes. Consumers subscribe rather than inventing manual refresh counters.
- Use `import type` for Obsidian-only or boundary-only types in pure modules and tests whenever runtime loading is unnecessary.

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

When implementation and an accepted ADR disagree, surface the conflict rather than silently introducing a third model.
