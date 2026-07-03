# CSS Structure

`index.css` is the only CSS entry imported by `src/main.ts`. Vite follows these imports and emits the root `styles.css` artifact that Obsidian loads.

Keep the import order stable:

- `base.css`: design tokens, root shell, shared utility classes, motion variables.
- `buttons.css`: shared button primitives and rating metadata.
- `home.css`: page shell, common headers, home deck list, shared stat cards.
- `study.css`: study setup, active card session, footer controls, completion state.
- `word-list.css`: word list toolbar, virtual rows, explanation panel.
- `practice-summary.css`: practice result summary and incorrect-card list.
- `stats.css`: history and statistics views.
- `overlays-settings.css`: empty states, modals, deck/card editor, settings tab.
- `theme-light.css`: light-theme token and component overrides.
- `motion.css`: focus states, scrollbars, keyframes, reduced-motion handling.
- `responsive.css`: tablet and mobile layout overrides.

Do not hand-edit the root `styles.css`; run `npm run build` to regenerate it.
