/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesDirectory = path.join(process.cwd(), "src", "styles");

interface Stylesheet {
	name: string;
	content: string;
}

async function loadStylesheets(): Promise<Stylesheet[]> {
	const names = (await readdir(stylesDirectory)).filter((name) => name.endsWith(".css")).sort();
	return Promise.all(
		names.map(async (name) => ({
			name,
			content: await readFile(path.join(stylesDirectory, name), "utf8"),
		})),
	);
}

function getLineNumber(content: string, index: number): number {
	return content.slice(0, index).split("\n").length;
}

function normalizeNonZeroPixels(value: string): string {
	return value.replace(/(?:^|[^\d.])0px\b/g, (match) => match.replace("0px", "0"));
}

describe("flashcard design system", () => {
	it("loads the fresh editorial layer last and responds to the plugin container", async () => {
		const index = await readFile(path.join(stylesDirectory, "index.css"), "utf8");
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		expect(index.trimEnd()).toMatch(/@import "\.\/editorial\.css";$/);
		expect(editorial).toMatch(
			/\.flashcard-root\s*\{[\s\S]*?container-name:\s*flashcard-page;[\s\S]*?container-type:\s*inline-size;/,
		);
		expect(editorial).toMatch(
			/@container\s+flashcard-page\s*\(max-width:\s*1100px\)\s*\{[\s\S]*?\.flashcard-home-workspace\s*\{[\s\S]*?display:\s*flex;/,
		);
	});

	it("uses shared surface colors and radii across the plugin views", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		for (const token of [
			"--fc-surface-canvas",
			"--fc-surface-card",
			"--fc-surface-section",
			"--fc-surface-raised",
			"--fc-surface-control",
			"--fc-surface-hover",
			"--fc-surface-selected",
			"--fc-radius-surface",
			"--fc-radius-control",
		]) {
			expect(base, token).toMatch(new RegExp(`${token}:`));
		}

		expect(editorial).toMatch(
			/\.flashcard-study-hero,[\s\S]*?\.flashcard-study-action-bar[\s\S]*?border-radius:\s*var\(--fc-radius-surface\);[\s\S]*?background:\s*var\(--fc-surface-card\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-word-list-sticky-top,[\s\S]*?\.flashcard-deck-settings-summary,[\s\S]*?border-radius:\s*var\(--fc-radius-surface\);[\s\S]*?background:\s*var\(--fc-surface-card\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-practice-stat-card,[\s\S]*?\.flashcard-stats-session,[\s\S]*?border-radius:\s*var\(--fc-radius-control\);[\s\S]*?background:\s*var\(--fc-surface-section\);/,
		);
	});

	it("centers the show-answer action and uses the accent hover surface", async () => {
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		expect(editorial).toMatch(
			/\.flashcard-footer,[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*center;/,
		);
		expect(editorial).toMatch(
			/\.flashcard-footer\s*>\s*\.flashcard-btn-show\s*\{[\s\S]*?margin-inline:\s*auto;[\s\S]*?flex:\s*0 1 620px;/,
		);
		expect(editorial).toMatch(
			/\.flashcard-deck-item\.fc-lift:hover,[\s\S]*?background:[\s\S]*?var\(--fc-surface-hover\);/,
		);
	});

	it("keeps setup panels from shrinking inside the scroll viewport", async () => {
		const home = await readFile(path.join(stylesDirectory, "home.css"), "utf8");
		const study = await readFile(path.join(stylesDirectory, "study.css"), "utf8");

		expect(home).toMatch(
			/\.flashcard-home,[\s\S]*?\.flashcard-word-list-view\s*\{[\s\S]*?min-height:\s*0;/,
		);
		expect(study).toMatch(
			/\.flashcard-setup-content\s*>\s*\*\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/,
		);
	});

	it("keeps deck settings checkboxes square on touch devices", async () => {
		const overlays = await readFile(
			path.join(stylesDirectory, "overlays-settings.css"),
			"utf8",
		);

		expect(overlays).toMatch(
			/\.flashcard-deck-settings-toggle-label input\[type="checkbox"\]\s*\{[\s\S]*?width:\s*var\(--fc-space-5\);[\s\S]*?height:\s*var\(--fc-space-5\);[\s\S]*?min-width:\s*var\(--fc-space-5\);[\s\S]*?min-height:\s*var\(--fc-space-5\);/,
		);
	});

	it("declares every referenced flashcard token", async () => {
		const stylesheets = await loadStylesheets();
		const combined = stylesheets.map(({ content }) => content).join("\n");
		const declarations = new Set(
			Array.from(combined.matchAll(/(--fc-[a-z0-9-]+)\s*:/g), (match) => match[1] ?? ""),
		);
		const references = new Set(
			Array.from(combined.matchAll(/var\((--fc-[a-z0-9-]+)/g), (match) => match[1] ?? ""),
		);

		expect([...references].filter((token) => !declarations.has(token))).toEqual([]);
	});

	it("keeps typography, radius, gap, and padding pixels in tokens", async () => {
		const stylesheets = await loadStylesheets();
		const violations: string[] = [];
		const declarationPattern =
			/(font-size|border-radius|gap|padding(?:-(?:top|right|bottom|left|inline|block))?)\s*:\s*([^;{}]+);/g;

		for (const { name, content } of stylesheets) {
			for (const match of content.matchAll(declarationPattern)) {
				const value = normalizeNonZeroPixels(match[2] ?? "");
				if (/\b(?:\d*\.)?\d+px\b/.test(value)) {
					violations.push(
						`${name}:${getLineNumber(content, match.index ?? 0)} ${match[0]}`,
					);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("inherits surfaces, text, accents, and semantic colors from Obsidian", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");
		const index = await readFile(path.join(stylesDirectory, "index.css"), "utf8");
		const settings = await readFile(
			path.join(stylesDirectory, "overlays-settings.css"),
			"utf8",
		);
		const directAliases = new Map([
			["--fc-bg", "--background-primary"],
			["--fc-text", "--text-normal"],
			["--fc-muted", "--text-muted"],
			["--fc-faint", "--text-faint"],
			["--fc-cyan", "--interactive-accent"],
			["--fc-blue", "--color-blue"],
			["--fc-magenta", "--color-pink"],
			["--fc-violet", "--color-purple"],
			["--fc-lime", "--color-green"],
			["--fc-amber", "--color-yellow"],
			["--fc-red", "--color-red"],
			["--fc-orange", "--color-orange"],
		]);

		for (const [token, obsidianToken] of directAliases) {
			expect(base, token).toMatch(new RegExp(`${token}:\\s*var\\(${obsidianToken}\\)`));
		}
		expect(base).toMatch(/--fc-bg-elevated:\s*var\(--background-primary\);/);
		expect(base).toMatch(
			/--fc-bg-panel:\s*color-mix\([\s\S]*?var\(--background-secondary\) 58%,[\s\S]*?var\(--background-primary\) 42%/,
		);
		expect(base).toMatch(/--fc-bg-panel-soft:\s*var\(--interactive-normal\);/);
		expect(base).toMatch(/--fc-surface-canvas:\s*var\(--background-secondary\);/);
		expect(base).toMatch(/--fc-surface-card:\s*var\(--background-primary\);/);
		expect(base).toMatch(
			/--fc-surface-raised:\s*color-mix\([\s\S]*?var\(--background-primary\) 92%,[\s\S]*?var\(--text-normal\) 8%/,
		);
		expect(base).not.toMatch(
			/\.theme-light[\s\S]*?--fc-bg-(?:rgb|elevated-rgb|panel-rgb|panel-soft-rgb):\s*var\(--mono-rgb-100\)/,
		);

		expect(index).not.toContain('@import "./theme-light.css";');
		expect(settings).not.toMatch(/--(?:background|text)-[a-z-]+\s*:/);
	});

	it("inherits primary deck actions from Obsidian", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");

		expect(base).toMatch(/--fc-action-study-start:\s*var\(--interactive-accent\);/);
		expect(base).toMatch(/--fc-action-study-text:\s*var\(--text-on-accent\);/);
		expect(base).toMatch(/--fc-surface-control:\s*var\(--interactive-normal\);/);
		expect(base).toMatch(/--fc-control-bg:\s*var\(--fc-surface-control\);/);
		expect(base).toMatch(/--fc-action-practice-start:\s*var\(--fc-control-bg\);/);
		expect(base).toMatch(/--fc-action-practice-text:\s*var\(--text-normal\);/);
	});

	it("keeps buttons, selected controls, and form fields visually distinct", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		for (const token of [
			"--fc-control-bg",
			"--fc-control-border",
			"--fc-control-border-selected",
			"--fc-input-bg",
			"--fc-input-border",
		]) {
			expect(base, token).toMatch(new RegExp(`${token}:`));
		}
		expect(base).toMatch(
			/--fc-input-bg:\s*color-mix\([\s\S]*?var\(--background-primary\) 96%,[\s\S]*?var\(--background-secondary\) 4%/,
		);

		expect(editorial).toContain('.flashcard-btn[aria-pressed="true"]');
		expect(editorial).toMatch(
			/\.flashcard-root button\.flashcard-setup-segment-btn\.active\s*\{[\s\S]*?border:\s*1px solid var\(--fc-control-border-selected\);/,
		);
		expect(editorial).not.toContain(
			".flashcard-root button.flashcard-setup-segment-btn.active::after",
		);
		expect(editorial).toMatch(
			/\.flashcard-setup-range-field\s*\{[\s\S]*?background:\s*var\(--fc-surface-control\);/,
		);
		expect(editorial).toMatch(
			/Shared form controls:[\s\S]*?border:\s*1px solid var\(--fc-input-border\);[\s\S]*?background:\s*var\(--fc-input-bg\);/,
		);
	});

	it("uses stronger surface levels for session content and controls", async () => {
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		expect(editorial).toMatch(
			/\.flashcard-card-stack\s*\{[\s\S]*?background:\s*var\(--fc-surface-card\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-response-controls,[\s\S]*?\.flashcard-practice-response-controls\s*\{[\s\S]*?background:\s*var\(--fc-surface-card\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-root button\.flashcard-rating-btn\s*\{[\s\S]*?--fc-rating-color:\s*var\(--fc-muted\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-root button\.flashcard-practice-btn-wrong\s*\{[\s\S]*?--fc-practice-answer-color:\s*var\(--fc-red\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-root button\.flashcard-practice-btn-correct\s*\{[\s\S]*?--fc-practice-answer-color:\s*var\(--fc-lime\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-root button\.flashcard-practice-btn-wrong:hover:not\(:disabled\),[\s\S]*?\.flashcard-root button\.flashcard-practice-btn-correct:focus-visible\s*\{[\s\S]*?background:\s*color-mix\([\s\S]*?var\(--fc-practice-answer-color\) 16%,[\s\S]*?var\(--fc-surface-control\)/,
		);
		expect(editorial).toMatch(
			/\.flashcard-explanation,[\s\S]*?\.theme-light \.flashcard-explanation\s*\{[\s\S]*?max-height:\s*40vh;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?scrollbar-gutter:\s*stable;/,
		);
		expect(editorial).toMatch(
			/\.flashcard-progress,[\s\S]*?\.flashcard-stats-session-dur\s*\{[\s\S]*?background:\s*color-mix\(in srgb, var\(--interactive-accent\) 8%, var\(--fc-surface-card\)\);/,
		);
	});

	it("keeps shared controls theme-aware and reserves elevation for floating menus", async () => {
		const controls = await readFile(path.join(stylesDirectory, "controls.css"), "utf8");
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		expect(controls).toMatch(
			/\.flashcard-control\s*\{[\s\S]*?border:\s*1px solid var\(--fc-input-border\);[\s\S]*?background:\s*var\(--fc-input-bg\);[\s\S]*?box-shadow:\s*none;/,
		);
		expect(controls).toMatch(
			/\.flashcard-menu\s*\{[\s\S]*?background:\s*var\(--fc-surface-raised\);[\s\S]*?box-shadow:\s*var\(--fc-shadow-popover\);/,
		);
		expect(editorial).toMatch(
			/\.flashcard-btn,[\s\S]*?background-color:\s*var\(--fc-control-bg\);[\s\S]*?box-shadow:\s*none;/,
		);
	});

	it("keeps compact action buttons outlined without adding shadows", async () => {
		const editorial = await readFile(path.join(stylesDirectory, "editorial.css"), "utf8");

		expect(editorial).toMatch(
			/Compact actions keep a visible boundary[\s\S]*?\.flashcard-menu-trigger,[\s\S]*?\.flashcard-deck-action-more,[\s\S]*?\.flashcard-home-header-action[\s\S]*?border:\s*1px solid var\(--fc-compact-control-border\);[\s\S]*?box-shadow:\s*none;/,
		);
		expect(editorial).toMatch(
			/button\.flashcard-btn\.flashcard-deck-action-more\s*\{[\s\S]*?border:\s*1px solid var\(--fc-compact-control-border\);/,
		);
	});
});
