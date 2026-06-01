/**
 * CSS Design Token Normalizer
 * - Border-radius base: 8px
 * - Spacing base: 10px
 *
 * Token scale:
 *   --fc-r-xs   4px
 *   --fc-r-sm   8px   ← base
 *   --fc-r-md   12px
 *   --fc-r-lg   16px
 *   --fc-r-xl   24px
 *   --fc-r-pill 999px
 *
 *   --fc-sp-1   5px
 *   --fc-sp-2   10px  ← base
 *   --fc-sp-3   15px
 *   --fc-sp-4   20px
 *   --fc-sp-5   30px
 *   --fc-sp-6   40px
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, "..", "styles.css");
const DEST = resolve(__dir, "..", "styles.css");

// ─── Token block (injected at the top of the file) ────────────────────────────
const TOKEN_BLOCK = `/* =============================================
   UI Design Tokens
   Border-radius base: 8px | Spacing base: 10px
   ============================================= */

.flashcard-root {
	/* Border-radius scale */
	--fc-r-xs:   4px;    /* micro  — code, kbd hints            */
	--fc-r-sm:   8px;    /* base   — buttons, inputs, tags      */
	--fc-r-md:   12px;   /* medium — cells, minor panels        */
	--fc-r-lg:   16px;   /* large  — stat cards, list items     */
	--fc-r-xl:   24px;   /* xl     — containers, modals, shells */
	--fc-r-pill: 999px;  /* pill   — badges, kickers            */

	/* Spacing scale */
	--fc-sp-1:   5px;    /* 0.5× base                           */
	--fc-sp-2:   10px;   /* 1×   base                           */
	--fc-sp-3:   15px;   /* 1.5× base                           */
	--fc-sp-4:   20px;   /* 2×   base                           */
	--fc-sp-5:   30px;   /* 3×   base                           */
	--fc-sp-6:   40px;   /* 4×   base                           */
}

`;

// ─── Border-radius mapping ─────────────────────────────────────────────────────
// Each entry: [rawValue, token]
// Process longer/compound values FIRST so they don't get partially replaced.
const RADIUS_MAP = [
	// Compound corner values
	["24px 24px 0 0", "var(--fc-r-xl) var(--fc-r-xl) 0 0"],
	["0 0 24px 24px", "0 0 var(--fc-r-xl) var(--fc-r-xl)"],
	// Single values — ordered largest → smallest so e.g. "18px" isn't caught by "8px" partial match
	["999px", "var(--fc-r-pill)"],
	["28px", "var(--fc-r-xl)"],
	["26px", "var(--fc-r-xl)"],
	["24px", "var(--fc-r-xl)"],
	["22px", "var(--fc-r-xl)"],
	["20px", "var(--fc-r-lg)"],
	["18px", "var(--fc-r-lg)"],
	["16px", "var(--fc-r-lg)"],
	["14px", "var(--fc-r-md)"],
	["12px", "var(--fc-r-md)"],
	["10px", "var(--fc-r-md)"],
	["8px", "var(--fc-r-sm)"],
	["6px", "var(--fc-r-sm)"],
	["4px", "var(--fc-r-xs)"],
];

// ─── Spacing mapping ───────────────────────────────────────────────────────────
// Round-to-nearest on the 5/10/15/20/30/40 scale
const SPACING_MAP = {
	"2px": "var(--fc-sp-1)",
	"3px": "var(--fc-sp-1)",
	"4px": "var(--fc-sp-1)",
	"5px": "var(--fc-sp-1)",
	"6px": "var(--fc-sp-1)",
	"7px": "var(--fc-sp-2)",
	"8px": "var(--fc-sp-2)",
	"9px": "var(--fc-sp-2)",
	"10px": "var(--fc-sp-2)",
	"11px": "var(--fc-sp-2)",
	"12px": "var(--fc-sp-2)",
	"13px": "var(--fc-sp-3)",
	"14px": "var(--fc-sp-3)",
	"15px": "var(--fc-sp-3)",
	"16px": "var(--fc-sp-3)",
	"17px": "var(--fc-sp-4)",
	"18px": "var(--fc-sp-4)",
	"19px": "var(--fc-sp-4)",
	"20px": "var(--fc-sp-4)",
	"21px": "var(--fc-sp-4)",
	"22px": "var(--fc-sp-4)",
	"23px": "var(--fc-sp-4)",
	"24px": "var(--fc-sp-4)",
	"25px": "var(--fc-sp-5)",
	"26px": "var(--fc-sp-5)",
	"27px": "var(--fc-sp-5)",
	"28px": "var(--fc-sp-5)",
	"29px": "var(--fc-sp-5)",
	"30px": "var(--fc-sp-5)",
	"32px": "var(--fc-sp-5)",
	"36px": "var(--fc-sp-5)",
	"40px": "var(--fc-sp-6)",
	"44px": "var(--fc-sp-6)",
};

// Tokenize a single pixel value from SPACING_MAP (or return original)
function spTok(px) {
	return SPACING_MAP[px] ?? px;
}

// ─── Transform helpers ─────────────────────────────────────────────────────────

/**
 * Replace `border-radius: <value>;` with token equivalents.
 * Handles both single-value and compound-corner cases.
 */
function replaceBorderRadius(css) {
	for (const [raw, token] of RADIUS_MAP) {
		// Match exactly: "border-radius: <raw>" where <raw> is the full value
		// (ends at ; or newline, possibly with whitespace)
		const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(
			`(border-radius:\\s*)${escaped}(?=[\\s;,)])`,
			"g",
		);
		css = css.replace(re, `$1${token}`);
	}
	return css;
}

/**
 * Replace padding / padding-inline / padding-block /
 * padding-top / padding-right / padding-bottom / padding-left
 * with token equivalents.
 *
 * Handles shorthand values up to 4 components.
 * The regex captures the value part (before ;) and tokenizes each component.
 */
function replacePadding(css) {
	const PROPS = [
		"padding",
		"padding-inline",
		"padding-block",
		"padding-top",
		"padding-right",
		"padding-bottom",
		"padding-left",
		"padding-inline-start",
		"padding-inline-end",
	].join("|");

	// Match "prop: val1 [val2] [val3] [val4];" where vals are px or 0 or var(...)
	// We only tokenize raw px values.
	const re = new RegExp(
		`((?:${PROPS}):\\s*)((?:[\\d]+px|0)(?:\\s+(?:[\\d]+px|0)(?:\\s+(?:[\\d]+px|0)(?:\\s+(?:[\\d]+px|0))?)?)?)(?=[\\s;,)])`,
		"g",
	);

	return css.replace(re, (match, prop, valStr) => {
		const parts = valStr.trim().split(/\s+/);
		const mapped = parts.map((p) => {
			if (p === "0") return "0";
			return spTok(p);
		});

		// Collapse identical adjacent values for shorthand compactness
		// (e.g. "10px 10px" → "10px" when using tokens)
		const tokens = mapped;
		return `${prop}${tokens.join(" ")}`;
	});
}

// ─── Main ──────────────────────────────────────────────────────────────────────

let css = readFileSync(SRC, "utf8");

// 1. Inject design token block before the file header comment
css = TOKEN_BLOCK + css;

// 2. Normalize border-radius
css = replaceBorderRadius(css);

// 3. Normalize padding
css = replacePadding(css);

writeFileSync(DEST, css, "utf8");
console.log("✅  Design tokens applied →", DEST);
