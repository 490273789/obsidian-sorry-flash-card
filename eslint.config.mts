import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

const sourceFiles = ["src/**/*.{ts,tsx}"];
const tsconfigRootDir = new URL(".", import.meta.url).pathname;

export default defineConfig(
	...obsidianmd.configs.recommended,
	{
		files: sourceFiles,
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parser: tseslint.parser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir,
			},
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"package.json",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
