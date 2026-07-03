# Domain Docs

Configured layout: **single-context**.

Engineering skills should read this repo's domain documentation before architecture, debugging, or TDD work when it is relevant.

## Before exploring, read these

- `CONTEXT.md` at the repo root
- `docs/adr/` for architectural decisions that touch the area being changed

If these files do not exist yet, proceed silently. The domain-modeling workflows create them lazily when terms or decisions are resolved.

## File structure

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- src/
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`.

If the concept is missing, either reconsider the wording or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface that explicitly instead of silently overriding it.
