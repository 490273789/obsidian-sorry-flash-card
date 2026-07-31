# Design QA

- Source visual truth:
  - Light: `/var/folders/29/55250yg90gdgsj79wzt6cvkh0000gn/T/codex-clipboard-aeac3806-503c-4f53-9251-ba678cbc4b1e.png`
  - Dark: `/var/folders/29/55250yg90gdgsj79wzt6cvkh0000gn/T/codex-clipboard-b69efc92-586f-424b-b543-23b457048354.png`
- Implementation screenshot: pending after the latest CSS build
- Viewport: Obsidian desktop, light theme
- Source pixels: light 2088 × 1990; dark 1928 × 2012
- Implementation pixels/CSS size/density: pending a post-build capture
- State: shared plugin shell across home, study, practice, summary, statistics, and word-list pages

## Full-view comparison evidence

The user-provided pre-fix screenshot shows that the initial micro-dot layer is effectively imperceptible at normal viewing scale. The large background remains visually flat despite the intended texture. The background treatment also needs to belong to the shared plugin shell rather than one route.

## Focused region comparison evidence

The empty area below the deck row was inspected at original resolution. Very faint dots are present, but their effective contrast is too low to create the requested sense of texture. A post-build focused comparison is pending.

## Findings

- [P2] Background treatment is too subtle and too narrowly scoped.
  - Location: shared `.flashcard-root::after`
  - Evidence: the dot layer is barely distinguishable from the cold-white base in the supplied screenshot.
  - Impact: the background still reads as a flat fill, and applying it only to the home route creates visual inconsistency.
  - Fix: move the treatment to the shared plugin root, increase the dot size and density, raise the light-theme opacity, and add broad low-contrast cyan and violet ambient-light fields.
- [P2] Dark-theme texture remains below perceptual contrast.
  - Location: `.theme-dark .flashcard-root::after`
  - Evidence: in the supplied dark screenshot, the dot field is barely visible and both ambient-light fields merge into the near-black base.
  - Impact: the dark theme still reads as a mostly flat fill and does not match the visible depth of the light theme.
  - Fix: use stronger dark-specific cyan/violet fields, move them into the open content area, increase dot contrast, and raise the dark texture-layer opacity.

## Comparison history

1. Initial finding: effective dot contrast was approximately 3%, which was not visible enough at the supplied desktop scale.
2. Fix made: dot spacing changed from 26 px to 22 px, dot radius from 0.7 px to 0.9 px, light-theme opacity from 0.34 to 0.66, and two broad ambient-light fields were added.
3. Scope correction: the treatment was moved from `.flashcard-home` to `.flashcard-root`, so every plugin page inherits it.
4. Dark-theme finding: the shared base opacity of 0.46 remained too weak against the near-black background.
5. Dark-theme fix: added a dedicated dark layer with stronger cyan/violet fields, higher dot contrast, lower-page focal positions, and opacity 0.78.
6. Post-fix evidence: pending screenshots after reloading the plugin.

## Required fidelity surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: unchanged.
- Colors and visual tokens: existing cyan and violet theme tokens are reused with theme-specific intensity; post-build dark visual balance is pending.
- Image quality and asset fidelity: no raster assets were introduced.
- Copy and content: unchanged.

## Implementation checklist

- Reload the plugin so the generated `styles.css` is applied.
- Capture representative light- and dark-theme home states, plus study and statistics states.
- Confirm that the texture is perceptible without competing with cards, controls, or learning content.

final result: blocked
