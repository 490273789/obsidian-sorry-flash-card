# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Repository: `490273789/obsidian-sorry-flash-card`

## Pull requests as a triage surface

**PRs as a request surface: no.**

Do not pull external PRs into `/triage`. Treat GitHub Issues as the request surface.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply / remove labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside this clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
