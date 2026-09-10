---
description: "Use when editing the flashcard plugin styles: SCSS under src/styles/ or colocated component styles under src/ui/, design tokens, spacing, surfaces, motion, and Obsidian theme compatibility. Covers the current token system and the generated styles.css artifact."
name: "Flashcard Styles"
applyTo: "src/**/*.scss"
---

# Flashcard stylesheet guidelines

- Edit SCSS under `src/styles/` (globals) and beside components under `src/ui/primitives/` and `src/ui/views/`. `src/styles/index.scss` is the single entry imported by `src/obsidian/main.ts`; Vite bundles it into the generated root `styles.css`, which is never hand-edited.
- Keep the import order in `src/styles/index.scss`: base tokens and mixins, settings, primitives, views, motion, then responsive overrides.
- Extend the current unified stylesheet instead of reviving removed legacy override blocks or parallel styling systems. Tokens are declared on `.flashcard-root` and `.flashcard-settings-tab`, which scope plugin styles away from the rest of Obsidian.
- Reuse the existing token hierarchy before adding new values: primitive RGB channels first (`--fc-<color>-rgb`, `--fc-bg-*-rgb`, mapped to Obsidian `--color-*-rgb`), semantic tokens second (`--fc-text`, `--fc-bg-*`, `--fc-surface-*`, `--fc-action-*`, `--fc-control-*`, `--fc-overlay`), and elevation/motion presets third (`--fc-shadow*`, `--fc-motion-*`, `--fc-ease-*`, `--fc-transition-*`).
- Keep new values on the existing scales: `--fc-font-*`, `--fc-weight-*`, `--fc-line-*`, `--fc-space-*`, `--fc-radius-*`, and `--fc-control-*`, instead of scattering raw values.
- Keep the Obsidian theme as the color source: prefer theme variables such as `--text-normal`, `--text-muted`, `--background-primary`, `--background-secondary`, and `--interactive-accent` over fixed light/dark palettes.
- Keep touch targets, keyboard focus, reduced-motion behavior, responsive layouts, and light/dark contrast intact. Style-only changes need no new unit tests, but require `pnpm run build` and visual inspection in Obsidian when feasible.
