# UI and Obsidian Guide

Read this guide before changing React UI, deck home behavior, the Obsidian view/settings adapters, localization, modals, or CSS.

## React and Obsidian boundaries

- Keep React components functional and colocated under `src/ui/components/`; prefer existing component boundaries before adding new ones.
- `FlashcardApp` owns navigation/setup drafts and adapts shared service snapshots. It must not become a second authority for deck, session, identity, or pronunciation state.
- Render card Markdown with Obsidian `MarkdownRenderer`, never raw HTML injection.
- Use the shared modal primitives under `src/ui/modal/` and the existing confirmation/card-editor components before creating a new overlay system.
- Use `lucide-react` for new React icon buttons. Keep controls keyboard-friendly and preserve existing shortcuts.
- Keep copy Chinese-first and route user-visible strings through `src/i18n/`.

## Deck home

`src/decks/deckHome.ts` is one shared plugin-lifetime module used by every open flashcard view.

- It owns home totals, per-deck study/spelling readiness, migration summary, one settings draft, refresh/migration/save activity, reorder persistence, PDF export activity, and navigation revalidation.
- React owns rendering, menus, modal visibility, confirmations, drag interaction, and final navigation handoff.
- Mutating operations are mutually exclusive; PDF export is a separate single-flight read-only activity.
- Do not derive competing readiness rules or raw deck-home statistics inside components.
- Reorder through the semantic `reorder` action so the saved `deckOrder` and shared snapshot stay aligned.

## Settings compatibility

`src/settings/settingsViewModel.ts` builds the pure definition tree; `src/obsidian/settingsTab.ts` renders it and owns Obsidian effects.

- Keep both `getSettingDefinitions()` and the imperative `display()` fallback working. The fallback prevents blank settings panes in environments where declarative definitions fail.
- `refreshDefinitions()` must call `update()` when available and render manually otherwise.
- Narrow unknown/union definition shapes with runtime guards before calling `render` in the manual path.
- Preserve async tag discovery/refresh and runtime subscription cleanup.
- Pronunciation controls derive values and busy/cache state from `PronunciationRuntime`; do not duplicate transient state in the settings adapter.
- After settings changes, explicitly verify that the settings tab is not blank when manual Obsidian testing is feasible.

## Styling

- Edit CSS only under `src/styles/`. `src/styles/index.css` is the sole entry imported by `src/obsidian/main.ts`; Vite generates root `styles.css`.
- Preserve the actual partial import order in `src/styles/index.css`: base, buttons, controls, home, study, word list, practice summary, spelling, pronunciation, stats, overlays/settings, motion, responsive.
- Reuse existing `--fc-*` tokens and Obsidian theme tokens. Avoid inline-style proliferation, new parallel token systems, or fixed light/dark palettes.
- Keep touch targets, keyboard focus, reduced-motion behavior, responsive layouts, and light/dark contrast intact.
- For a visible regression, make the smallest effective repair before considering broader redesign.
- Style-only changes need no new unit tests, but require `npm run build` and visual inspection in Obsidian when feasible.

Component or Obsidian API tests need explicit mocks/setup; do not rely accidentally on browser globals in the Vitest environment.
