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

function hexToLinearChannel(channel: number): number {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function getLuminance(hex: string): number {
	const value = hex.replace("#", "");
	const channels = [0, 2, 4].map((index) =>
		hexToLinearChannel(Number.parseInt(value.slice(index, index + 2), 16)),
	);
	const [red = 0, green = 0, blue = 0] = channels;
	return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function getContrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = getLuminance(foreground);
	const backgroundLuminance = getLuminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function readHexToken(content: string, token: string): string {
	const match = content.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
	const value = match?.[1];
	if (!value) throw new Error(`Missing hexadecimal value for ${token}`);
	return value;
}

describe("flashcard design system", () => {
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

	it("keeps core text colors at WCAG AA contrast", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");
		const light = await readFile(path.join(stylesDirectory, "theme-light.css"), "utf8");
		const themes = [
			{
				name: "dark",
				content: base,
				background: readHexToken(base, "--fc-bg"),
			},
			{
				name: "light",
				content: light,
				background: readHexToken(light, "--fc-bg"),
			},
		];
		const tokens = [
			"--fc-text",
			"--fc-muted",
			"--fc-faint",
			"--fc-cyan",
			"--fc-blue",
			"--fc-magenta",
			"--fc-violet",
			"--fc-lime",
			"--fc-amber",
			"--fc-red",
			"--fc-orange",
		];

		for (const theme of themes) {
			for (const token of tokens) {
				const foreground = readHexToken(theme.content, token);
				expect(
					getContrastRatio(foreground, theme.background),
					`${theme.name} ${token}`,
				).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	it("keeps primary deck actions readable across both gradient endpoints", async () => {
		const base = await readFile(path.join(stylesDirectory, "base.css"), "utf8");
		const light = await readFile(path.join(stylesDirectory, "theme-light.css"), "utf8");

		for (const [name, content] of [
			["dark", base],
			["light", light],
		] as const) {
			for (const action of ["study", "practice"] as const) {
				const foreground = readHexToken(content, `--fc-action-${action}-text`);
				for (const endpoint of ["start", "end"] as const) {
					const background = readHexToken(content, `--fc-action-${action}-${endpoint}`);
					expect(
						getContrastRatio(foreground, background),
						`${name} ${action} ${endpoint}`,
					).toBeGreaterThanOrEqual(4.5);
				}
			}
		}
	});
});
