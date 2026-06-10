# Codex Project Instructions

## Project Overview

This repository is an Obsidian plugin named `wsr-flash-card`.

- Domain: Chinese flashcard learning inside Obsidian.
- Stack: TypeScript, React, Obsidian API, esbuild, `ts-fsrs`.
- Entry point: `src/main.ts`.
- Main custom view: `src/FlashcardView.tsx`, rendering `src/components/FlashcardApp.tsx`.
- Settings tab: `src/settingsTab.ts`.
- Data and persistence: `src/dataStore.ts`.
- Markdown flashcard parsing: `src/parser.ts`.
- FSRS scheduling: `src/scheduler.ts`.
- Styles: `styles.css`.

The plugin scans Markdown files whose first tag matches configured flashcard tags. Cards use `---div---` between question and answer, and `<->` between cards.

## Response Style

- Reply to the user in Chinese unless they ask for another language.
- Be direct and task-focused.
- For visible UI regressions, prefer the smallest effective repair before broader redesign.
- When changing user-facing text, keep the existing Chinese tone and terminology unless the user asks for a rewrite.

## Documentation Lookup

Use Context7 MCP for current library, framework, SDK, API, CLI, or cloud-service documentation questions.

1. Start with `resolve-library-id` using the library name and the user's full question, unless the user provides an exact `/org/project` library ID.
2. Pick the best match by exact name, description relevance, snippet count, source reputation, and benchmark score.
3. Run `query-docs` with the selected library ID and the user's full question.
4. Answer from the fetched docs.

Do not use Context7 for ordinary refactors, business-logic debugging, local code review, or scripts written from scratch.

## Development Commands

Use these commands from the project root:

```bash
npm install
npm run dev
npm run build
npm run lint
```

`npm run build` runs TypeScript checking and the production esbuild bundle. Treat it as the primary validation command after code changes.

There is no dedicated unit-test command in `package.json` currently. If adding tests, wire them into package scripts before relying on them as project validation.

## Editing Rules

- Edit source files under `src/` and `styles.css`; avoid editing generated `main.js`.
- Keep edits narrowly scoped to the user request.
- Preserve existing TypeScript style: tabs for indentation, explicit interfaces/types, and named helper functions where the surrounding code uses them.
- Avoid unrelated refactors, dependency churn, and formatting-only rewrites.
- Use Obsidian APIs for vault, view, settings, notice, and Markdown rendering behavior instead of browser-only assumptions.
- Keep React components functional and colocated with the current component structure under `src/components/`.
- Keep UI copy and labels Chinese-first.

## Obsidian Plugin Architecture

- `FlashcardPlugin.onload()` initializes `DataStore`, loads settings/data once, registers the custom view, commands, ribbon icon, and settings tab.
- `FlashcardPlugin.saveSettings()` persists through `DataStore` and updates active `FlashcardView` instances.
- `FlashcardView.onOpen()` syncs decks once, caches available tags, creates a React root, and renders `FlashcardApp`.
- `FlashcardApp` owns most navigation state between home, setup, study, practice, summary, word list, and stats views.

When adding plugin capabilities, register Obsidian-facing commands or views in `src/main.ts`, but keep feature behavior in the relevant data, parser, scheduler, or React component modules.

## Data Persistence

`DataStore` is the source of truth for decks, settings, study history, and discovered tags.

- Save via `DataStore.saveSettings()` or `DataStore.save()`.
- Do not bypass `DataStore` with separate plugin data writes.
- Preserve backward-compatible migrations in `loadSettings()`, especially legacy `flashcardTag` to `flashcardTags`.
- Preserve existing FSRS card state when syncing or reparsing files.
- Deck IDs are based on source file paths; changing that affects persisted history and card state.

## Settings Tab Guidance

Be careful with `src/settingsTab.ts`.

- Keep both `getSettingDefinitions()` and the imperative `display()` fallback path working.
- Preserve `refreshDefinitions()` behavior: call `update()` when available, otherwise render manually.
- When rendering definitions manually, narrow unknown/union shapes with runtime guards before calling `render`.
- When changing tag controls, keep async tag loading and discovered-tag refresh behavior intact.
- Validate settings changes with `npm run build` at minimum.

This compatibility path exists because relying only on declarative settings definitions has caused blank settings panes in some environments.

## Parser and Flashcard Format

Parser behavior lives in `src/parser.ts`.

- The first hashtag in a Markdown file identifies the deck tag.
- Supported tag matching includes Chinese characters.
- Cards are split by `<->`.
- Question and answer are split by `---div---`.
- Preserve existing card IDs as `${filePath}::${index}` unless intentionally migrating stored data.
- Preserve existing card FSRS state when parsing updated files.

## Scheduling Behavior

Scheduling lives in `src/scheduler.ts` and uses `ts-fsrs`.

- Ratings 1-4 map to FSRS Again, Hard, Good, Easy.
- Rating 5 is a custom "辣鸡" path that schedules the card 21 days later.
- Keep interval labels and keyboard shortcuts aligned with `getRatingButtons()` and the UI.
- Be cautious when changing date math, due checks, or serialized FSRS card fields.

## UI and Styling

- Main UI is React rendered inside the Obsidian view.
- Markdown card content should use Obsidian `MarkdownRenderer`, not raw HTML injection.
- Prefer existing component boundaries before creating new ones.
- Use `lucide-react` icons when adding icon buttons in React UI.
- Keep controls keyboard-friendly; existing shortcuts are part of the product behavior.
- Update `styles.css` for visual changes and avoid inline style proliferation.
- Check mobile constraints when touching layout because the README promises mobile compatibility.

## Validation Checklist

Before finishing a code-change task:

1. Run `npm run build`.
2. Run `npm run lint` when the change touches TypeScript/React patterns, Obsidian API usage, or shared modules.
3. For UI work, inspect the relevant view in Obsidian when feasible, or clearly state that only build/lint validation was run.
4. For settings-tab changes, explicitly verify that the settings tab is not blank.
5. Mention any validation command that could not be run.

## Files to Treat Carefully

- `src/dataStore.ts`: persisted data shape and migrations.
- `src/settingsTab.ts`: Obsidian settings compatibility behavior.
- `src/parser.ts`: card identity and deck detection.
- `src/scheduler.ts`: review scheduling semantics.
- `manifest.json` and `versions.json`: plugin release metadata; update intentionally, usually through `npm run version`.
- `main.js`: generated bundle; do not hand-edit.
