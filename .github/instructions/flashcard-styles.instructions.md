---
description: "Use when editing the flashcard plugin stylesheet, design tokens, gradients, spacing, surfaces, or component styling in styles.css. Covers the current token system, semantic color usage, and CSS normalization expectations for this repo."
name: "Flashcard Styles"
applyTo: "styles.css"
---

# Flashcard stylesheet guidelines

- Extend the current unified stylesheet instead of reviving removed legacy override blocks or parallel styling systems.
- Reuse the existing token hierarchy before adding new values: primitive RGB variables first, semantic tokens second, and gradient presets third.
- Prefer semantic and surface tokens such as `--fc-color-*`, `--fc-surface*`, `--fc-border`, and `--fc-shadow` in component rules. Add or keep legacy `--flashcard-*` aliases only when needed for backward compatibility.
- Keep spacing and radius changes aligned with the existing `--fc-sp-*`, `--fc-gap-*`, and `--fc-r-*` scales instead of scattering new raw values.
