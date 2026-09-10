# Study Studio Agent Guide

## Project Agent Rules

The primary agent is responsible for:

- understanding the user's goal
- task decomposition
- architecture decisions
- complex reasoning
- coordinating subagents
- integrating results
- final verification

Use subagents selectively.

Do not spawn a subagent when the task can be completed directly with only a few simple tool calls.

---

## Subagent Routing

Use the existing global subagents according to task type.

### explorer

Use for:

- locating files
- repository exploration
- symbol search
- grep / rg
- tracing references
- identifying relevant implementations
- understanding project structure

Prefer `explorer` when investigation would otherwise require reading many files in the primary agent context.

---

### tester

Use for:

- running tests
- running builds
- linting
- type checking
- reproducing bugs
- executing commands
- collecting relevant logs

Do not return large raw logs unless necessary.

Return concise failure causes and relevant files.

---

### worker

Use for:

- routine feature implementation
- ordinary business logic
- small bug fixes
- straightforward refactoring
- localized code changes

Prefer minimal changes and follow existing project conventions.

---

### solver

Use for:

- difficult bugs
- complex implementation
- cross-module changes
- asynchronous or state-related issues
- performance problems
- architecture-sensitive refactoring

Use `solver` only when the task genuinely requires deeper reasoning.

---

### reviewer

Use after meaningful changes when independent verification is useful.

Focus on:

- correctness
- regressions
- edge cases
- missing tests
- security risks
- maintainability problems

Do not use reviewer for trivial changes unless necessary.

---

## Escalation Strategy

Always prefer the cheapest agent that can reliably complete the task.

Default escalation path:

```text
explorer / tester
        ↓
      worker
        ↓
      solver
        ↓
 primary agent
```

Do not escalate only because a task is large.

Escalate when the current agent lacks the reasoning capability required to complete it reliably.

---

## Context Efficiency

Keep noisy work inside subagents whenever practical.

Examples:

- large repository searches
- test logs
- build output
- dependency inspection
- repetitive file reads
- broad implementation discovery

Subagents should return concise summaries instead of raw intermediate output.

Prefer returning:

- conclusion
- relevant files
- relevant symbols
- root cause
- important constraints
- recommended next action

Avoid returning:

- full file contents
- complete logs
- large command outputs
- unrelated findings

---

## Parallelism

Run independent tasks in parallel when doing so clearly improves efficiency.

Good examples:

```text
explorer → inspect frontend flow

explorer → inspect backend API

tester → reproduce existing failure
```

Avoid assigning multiple agents to perform the same investigation without a specific reason.

Do not create unnecessary subagents merely to increase parallelism.

---

## Code Changes

Before modifying code:

1. identify the relevant implementation
2. understand existing conventions
3. determine the smallest reasonable change

During implementation:

- avoid unrelated refactoring
- avoid unnecessary dependencies
- preserve existing behavior unless the task requires changing it
- follow existing naming and architectural patterns

After implementation:

- verify affected behavior
- run relevant tests when available
- check for obvious regressions

---

## Project-Specific Rules

### Always know

This repository is the `wsr-flash-card` Obsidian plugin for Chinese-first flashcard learning.

- Stack: TypeScript, React, Obsidian API, Vite, Vitest, and `ts-fsrs`.
- Plugin entry point: `src/obsidian/main.ts`.
- Main React adapter: `src/ui/components/FlashcardApp.tsx`.
- Markdown source files are authoritative for card content; plugin data stores derived decks, learning state, settings, history, and continuity metadata.
- Source code lives under `src/`. Root `main.js` and `styles.css` are generated Obsidian artifacts; never edit them by hand.
- Modifying styles and pages does not require writing test cases: UI and styling changes do not require tests. Add or update
  tests only for behavior changes and regressions.

### Working rules

- Reply in Chinese unless the user requests another language.
- Use Obsidian APIs for vault, view, settings, notices, secrets, requests, and Markdown rendering. Do not replace them with browser-only assumptions.
- Preserve established module boundaries and domain invariants. Read the relevant guide below before changing behavior in that area.
- Update focused tests beside the affected module when changing testable logic.
- After code changes(except UI change), run `npm run build` at minimum. Run the additional checks required by `docs/agents/testing-and-workflow.md`, and report any check or manual verification that was not run.

### Current documentation lookup

For questions about a library, framework, SDK, API, CLI, or cloud service, use Context7 even if the API seems familiar. Do not use it for ordinary refactors, local business-logic debugging, code review, or scripts written from scratch.

1. Resolve the library ID with the library name and the user's full question, unless an exact `/org/project` ID was supplied.
2. Select the closest reputable match, including the requested version when applicable.
3. Query that library ID with the user's full question.
4. Base the answer or implementation on the returned current documentation.

### Progressive disclosure

Read only the guides relevant to the current task. If a task crosses multiple areas, read each applicable guide before editing.

Do not preload every guide. Follow links from a selected guide only when the task needs that detail.

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

## Final Ownership

The primary agent owns the final result.

Subagent output should be treated as evidence and implementation assistance, not automatically accepted as correct.

Before completing the task, the primary agent should ensure:

- the user's requirement is satisfied
- changes are consistent with project architecture
- important subagent findings are reconciled
- relevant validation has been performed
- unrelated changes have not been introduced
