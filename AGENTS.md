# Study Studio Agent Guide

## What this repository is

`StudyStudio` — an Obsidian flashcard plugin for Chinese-first learning.

- Stack: TypeScript, React, Obsidian API, Vite, Vitest, `ts-fsrs`.
- Composition root: `src/obsidian/main.ts`; React adapter: `src/ui/FlashcardApp.tsx`.
- Hand-written source lives under `src/`. Root `main.js` and `styles.css` are generated from it — edit the source, never the artifact.
- Markdown notes are the authority for card content. Plugin data holds derived decks, learning state, settings, history, and continuity metadata.

## Working rules

- Reply in Chinese unless the user requests another language.
- Use Obsidian APIs for vault, view, settings, notices, secrets, requests, and Markdown rendering; do not replace them with browser-only assumptions.
- Preserve module boundaries and domain invariants. Read the guide for the area before changing behavior in it.
- After any code change, run `pnpm run build` at minimum, and report every check and manual verification you did not run. UI and styling changes need no new tests; behavior changes need focused tests beside the affected module.
- Never whole-read the generated and data artifacts: `data.json` (1.7 MB) and `main.js` (586 KB) will consume the context in one call. Grep them or read bounded ranges instead.

## Progressive disclosure

Read only the guides relevant to the current task; a task crossing several areas reads each applicable guide. Follow a selected guide's links further only when the task needs that detail.

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
| Dictionary lookup, local dictionaries, sources, or sandbox rendering            | `docs/agents/dictionary.md`                                                         |
| GitHub issue operations                                                         | `docs/agents/issue-tracker.md`; for triage also read `docs/agents/triage-labels.md` |

## Subagent roles

Dispatch a role by naming it and its contract in a `subagent` prompt; the same five exist as native agents under `~/.codex/agents/`.

| Role       | Use for                                                                                           | Return                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `explorer` | locating files, symbol and reference search, understanding structure                              | relevant files, symbols, findings, recommended next step                 |
| `tester`   | builds, tests, lint, typecheck, reproducing a failure, collecting logs                            | command, pass/fail, root error, relevant file                            |
| `worker`   | routine features, business logic, small fixes, localized refactors                                | changed files, implementation decisions, regressions checked             |
| `solver`   | difficult bugs, cross-module or async/state work, performance, architecture-sensitive refactoring | root cause, implementation performed, risks, validation performed        |
| `reviewer` | independent verification after meaningful changes                                                 | findings by severity, each with affected file, impact, reproduction, fix |

- Delegate when the work would otherwise flood your context with searches, logs, or file reads; a few tool calls are cheaper done directly.
- Prefer the cheapest role that can finish reliably, and escalate on missing reasoning capability, not on task size.
- Keep the noise in the child: logs, full file contents, and broad search results stay in its context.
- Treat every child's output as evidence, never as automatically correct — you own the final result.

## Reference lookup

For questions about a library, framework, SDK, API, CLI, or cloud service, use Context7 even when the API looks familiar. Skip it for ordinary refactors, local business-logic debugging, code review, and scripts written from scratch.
