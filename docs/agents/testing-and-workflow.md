# Testing and Workflow Guide

Read this guide when changing code, choosing validation, touching generated/release files, deploying, or preparing a commit.

## Commands

Run commands from the repository root with npm, which is the documented project workflow.

```bash
npm install
npm run dev
npm test
npm run test:watch
npm run typecheck
npm run build
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm run check:all
npm run setup-hooks
```

- `npm run build` runs TypeScript checking and the production Vite bundle. It is the minimum validation after code changes.
- `npm run check:all` runs format check, lint/typecheck, and the full Vitest suite.
- `npm run deploy` builds and copies artifacts to the maintainer's configured iCloud vault. It is machine-specific; never run it unless the user explicitly asks to deploy.

## Editing and generated files

- Edit TypeScript/React under `src/` and CSS under `src/styles/`.
- Do not hand-edit generated root `main.js` or `styles.css`; regenerate them with `npm run build` when the task requires distributable artifacts.
- Change `manifest.json` and `versions.json` only for an intentional release/version task. Use `pnpm release:patch|minor|major` as documented; do not invoke the lifecycle script with `pnpm run version` directly.
- Preserve the local style: tabs in TypeScript, explicit interfaces/types, and named helpers where surrounding code uses them.
- Avoid dependency/lockfile churn unless dependency work is in scope.

## Validation matrix

Always run `npm run build` after code changes, then add checks based on risk:

| Change                                                                                                              | Required validation                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Parser, cards, identity, storage, sessions, scheduling, spelling, pronunciation, deck logic, or presentation models | Focused tests or `npm test`, plus `npm run build`                         |
| TypeScript/React patterns, Obsidian API usage, or shared modules                                                    | `npm run lint`                                                            |
| Broad edits or possible formatting changes                                                                          | `npm run format:check`                                                    |
| Pre-commit/full confidence pass                                                                                     | `npm run check:all` and `npm run build`                                   |
| Style-only                                                                                                          | `npm run build` plus visual inspection; no new test required              |
| Settings tab                                                                                                        | Build plus manual check that the pane is not blank when feasible          |
| Pronunciation                                                                                                       | Tests/build plus report the fallback path actually exercised              |
| PDF export                                                                                                          | Relevant tests/build plus report whether a real desktop PDF was inspected |

Keep focused tests in the affected module's `__tests__/` directory. Prefer pure logic tests and public deep-module interfaces. Add explicit mocks when React or Obsidian runtime behavior must be loaded.

Report every validation command run and any manual check that could not be performed.

## Commits and releases

Follow Conventional Commits and `docs/git-commit-guide.md`.

- Format: `<type>(<scope>): <subject>`.
- Keep commits atomic and subjects specific, imperative, and without a trailing period.
- Common types: `feat`, `fix`, `style`, `refactor`, `perf`, `test`, `docs`, `chore`, `revert`.
- Common scopes: `ui`, `styles`, `cards`, `parser`, `identity`, `session`, `pronunciation`, `deck`, `obsidian`, `settings`, `storage`, `history`, `word-list`, `i18n`, `deps`, `release`.
- Hooks configured by `scripts/setup-hooks.mjs` enforce pre-commit checks and commit-message format.
- `pnpm release:patch|minor|major` runs `scripts/version-bump.mjs` to keep `package.json`, `manifest.json`, and `versions.json` in sync, and creates the Conventional Commit-compatible release commit and tag. Do not add a redundant second release commit.
- Do not create a commit, bump a version, push, release, or deploy unless the user asks for that action.
