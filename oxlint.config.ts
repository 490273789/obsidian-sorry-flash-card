import { defineConfig } from "oxlint";

export default defineConfig({
	env: {
		browser: true,
		es2020: true,
	},
	ignorePatterns: [
		"node_modules",
		"dist",
		"main.js",
		"vite.config.ts",
		"version-bump.mjs",
		"versions.json",
	],
	options: {
		typeAware: true,
	},
	plugins: [
		"typescript",
		"react",
		"react-perf",
		"jsx-a11y",
		"import",
		"promise",
		"unicorn",
		"oxc",
	],
	settings: {
		react: {
			version: "19.2.7",
		},
	},
});
