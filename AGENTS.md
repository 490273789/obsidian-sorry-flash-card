# WSR Flash Card Agent Guide

## Always know

This repository is the `wsr-flash-card` Obsidian plugin for Chinese-first flashcard learning.

- Stack: TypeScript, React, Obsidian API, Vite, Vitest, and `ts-fsrs`.
- Plugin entry point: `src/obsidian/main.ts`.
- Main React adapter: `src/ui/components/FlashcardApp.tsx`.
- Markdown source files are authoritative for card content; plugin data stores derived decks, learning state, settings, history, and continuity metadata.
- Source code lives under `src/`. Root `main.js` and `styles.css` are generated Obsidian artifacts; never edit them by hand.
- Modifying styles and pages does not require writing test cases: UI and styling changes do not require tests. Add or update
  tests only for behavior changes and regressions.

## Working rules

- Reply in Chinese unless the user requests another language.
- Keep changes narrowly scoped. Do not mix unrelated refactors, dependency updates, formatting, or copy rewrites into the task.
- Preserve the existing Chinese product terminology and tone for user-facing text.
- Use Obsidian APIs for vault, view, settings, notices, secrets, requests, and Markdown rendering. Do not replace them with browser-only assumptions.
- Preserve established module boundaries and domain invariants. Read the relevant guide below before changing behavior in that area.
- Update focused tests beside the affected module when changing testable logic.
- After code changes, run `npm run build` at minimum. Run the additional checks required by `docs/agents/testing-and-workflow.md`, and report any check or manual verification that was not run.

## Progressive disclosure

Read only the guides relevant to the current task. If a task crosses multiple areas, read each applicable guide before editing.

| Task area                                                                       | Read before changing                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Plugin lifecycle, dependency ownership, or cross-module architecture            | `docs/agents/architecture.md` and relevant `docs/adr/` records                      |
| Card syntax, parsing, source edits, persistence, migrations, or stable identity | `docs/agents/cards-data-and-identity.md`                                            |
| Study, practice, spelling, scheduling, results, undo, or answer transitions     | `docs/agents/sessions.md`                                                           |
| Pronunciation, autoplay, online providers, secrets, or audio cache              | `docs/agents/pronunciation.md`                                                      |
| React UI, deck home, Obsidian view/settings, localization, modals, or CSS       | `docs/agents/ui-and-obsidian.md`                                                    |
| Desktop deck PDF export                                                         | `docs/agents/pdf-export.md`                                                         |
| Commands, tests, validation, generated files, deployment, commits, or releases  | `docs/agents/testing-and-workflow.md`                                               |
| Domain terminology, architecture/debugging/TDD context, or an ADR decision      | `docs/agents/domain.md`, then `CONTEXT.md` and only the relevant `docs/adr/` files  |
| GitHub issue operations                                                         | `docs/agents/issue-tracker.md`; for triage also read `docs/agents/triage-labels.md` |

Do not preload every guide. Follow links from a selected guide only when the task needs that detail.

## Current documentation lookup

For questions about a library, framework, SDK, API, CLI, or cloud service, use Context7 even if the API seems familiar. Do not use it for ordinary refactors, local business-logic debugging, code review, or scripts written from scratch.

1. Resolve the library ID with the library name and the user's full question, unless an exact `/org/project` ID was supplied.
2. Select the closest reputable match, including the requested version when applicable.
3. Query that library ID with the user's full question.
4. Base the answer or implementation on the returned current documentation.
