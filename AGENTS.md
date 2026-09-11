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
- After any code change, run `pnpm run build` at minimum. Report checks performed and any required checks or relevant manual verification left incomplete. Purely visual and styling changes need no new tests; behavior changes, including UI interactions, need focused tests beside the affected module.
- Use targeted searches or bounded reads for large generated and data artifacts such as `data.json` and `main.js`; never read them in full.

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

Use the runtime's subagent tool and explicit role selector (in this Codex runtime, `collaboration.spawn_agent` with `agent_type`). Choose from roles exposed by the current runtime; naming a role in the prompt alone does not select its configuration. If a suitable role is unavailable, handle the work locally.

| Role       | Use for                                                                                           | Return                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `explorer` | locating files, symbol and reference search, understanding structure                              | relevant files, symbols, findings, recommended next step                 |
| `tester`   | builds, tests, lint, typecheck, reproducing a failure, collecting logs                            | command, pass/fail, root error, relevant file                            |
| `worker`   | routine features, business logic, small fixes, localized refactors                                | changed files, implementation decisions, regressions checked             |
| `solver`   | difficult bugs, cross-module or async/state work, performance, architecture-sensitive refactoring | root cause, implementation performed, risks, validation performed        |
| `reviewer` | independent verification after meaningful changes                                                 | findings by severity, each with affected file, impact, reproduction, fix |

- Delegate bounded, independent tasks when doing so reduces substantial context load or enables useful parallel work, and the primary agent has other useful work to continue. Handle tasks requiring only a few tool calls locally.
- Choose the lightest suitable role and use its configured model and reasoning settings. If the task exceeds its capabilities, have the child report findings and blockers so the primary agent can take over or escalate.
- Each task must specify its objective, relevant context and guide paths, scope, file ownership, completion criteria, validation requirements, and expected output. Pass only the context needed for that task.
- Agents share the working directory. Assign non-overlapping write scopes to concurrent implementation tasks; sequence dependent or overlapping changes. Preserve other agents' edits.
- Keep explorer and reviewer tasks read-only. Use tester to execute validation and report failures to the implementation owner, rather than make source changes. Coordinate builds and other commands that write shared artifacts; run final integration checks after edits are stable.
- Continue independent work while children run, without duplicating their tasks. Collect all required results before declaring completion.
- Keep raw logs, full file contents, and broad search results in the child context. Return concise findings with file references, validation evidence, uncertainties, and blockers.
- Treat every child's output as evidence, never as automatically correct. The primary agent inspects actual changes and validation results, resolves findings, and verifies the integrated result.

## Reference lookup

For questions about a library, framework, SDK, API, CLI, or cloud service, use Context7 even when the API looks familiar. Skip it for ordinary refactors, local business-logic debugging, code review, and scripts written from scratch.
