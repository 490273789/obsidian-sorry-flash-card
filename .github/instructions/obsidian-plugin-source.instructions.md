---
description: "Use when editing the Obsidian flashcard plugin source, including TypeScript, TSX, React components, data store logic, parser, scheduler, settings tab, or plugin lifecycle code under src/. Covers repo-specific structure and validation expectations."
name: "Obsidian Plugin Source"
applyTo: "src/**"
---

# Obsidian plugin source guidelines

- Keep `src/main.ts` focused on plugin lifecycle, view registration, commands, and settings wiring. Move feature logic into focused modules under `src/` instead of growing `main.ts`.
- Edit source files under `src/` and do not hand-edit generated release artifacts such as `main.js`.
- Preserve Obsidian plugin conventions: keep command IDs stable, use the provided lifecycle registration helpers for anything that needs cleanup, and keep startup work in `onload` lightweight.
- Prefer small, module-local changes that fit the existing boundaries: persistence in `DataStore`, parsing in `parser.ts`, scheduling in `scheduler.ts`, and UI behavior in the React and view files.
- When changing persisted data or plugin compatibility, keep `manifest.json` and `versions.json` aligned with the actual minimum Obsidian version required by the code.
- Validate code changes with `pnpm lint` and `pnpm build`. If sandboxed terminal runs cannot find `node`, rerun those validations unsandboxed.
