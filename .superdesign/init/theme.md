# Design System Tokens & Theme

## Part 1 — Compact Token Summary

### Color Tokens (Semantic & Theming)

- Primary Accent: var(--interactive-accent) (Obsidian theme accent, cyan/purple)
- Text Normal: var(--text-normal) (high-contrast body text)
- Text Muted: var(--text-muted) (secondary descriptions, meta info)
- Text Faint: var(--text-faint) (placeholders, timestamps, borders)
- Background Primary: var(--background-primary) (main view canvas)
- Background Secondary: var(--background-secondary) (sidebar, grouped panels)
- Card Surface: color-mix(in srgb, var(--background-primary) 96%, var(--text-normal) 4%)
- Panel Surface: color-mix(in srgb, var(--background-secondary) 58%, var(--background-primary) 42%)
- Border / Line: var(--background-modifier-border)
- Border Soft: color-mix(in srgb, var(--background-modifier-border) 60%, transparent)
- Hover Surface: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary) 88%)
- Selected Surface: color-mix(in srgb, var(--interactive-accent) 22%, var(--background-primary) 78%)

### Status Colors

- Again / Danger: var(--color-red) (RGB: 235, 87, 87)
- Hard / Warning: var(--color-orange) (RGB: 242, 153, 74)
- Good / Success: var(--color-blue) / Accent (RGB: 47, 128, 237)
- Easy / Optimal: var(--color-green) (RGB: 39, 174, 96)

### Typography Scale

- --fc-font-xs: 11px
- --fc-font-sm: 13px
- --fc-font-md: 14px
- --fc-font-lg: 15px
- --fc-font-xl: 18px
- --fc-font-display: 20px
- --fc-font-hero: 24px
- --fc-font-focus: 32px

### Spacing Scale

- --fc-space-1: 4px
- --fc-space-2: 6px
- --fc-space-3: 8px
- --fc-space-4: 12px
- --fc-space-5: 14px
- --fc-space-6: 16px
- --fc-space-7: 20px
- --fc-space-8: 24px

### Border Radius Scale

- --fc-radius-xs: 2px
- --fc-radius-sm: 4px
- --fc-radius-md: 6px
- --fc-radius-lg: 8px
- --fc-radius-pill: 999px

## Part 2 — Raw Source Dumps

### base.scss

```scss
/*
 * WSR Flash Card editorial UI foundations
 * Scope all styles to the plugin root/settings tab to avoid leaking into Obsidian.
 */

.flashcard-root,
.flashcard-settings-tab {
	--fc-font-xs: 11px;
	--fc-font-sm: 13px;
	--fc-font-md: 14px;
	--fc-font-lg: 15px;
	--fc-font-xl: 18px;
	--fc-font-display: 20px;
	--fc-font-hero: 24px;
	--fc-font-focus: 32px;
	--fc-weight-regular: 400;
	--fc-weight-medium: 500;
	--fc-weight-semibold: 600;
	--fc-weight-bold: 700;
	--fc-line-tight: 1.2;
	--fc-line-body: 1.5;
	--fc-line-reading: 1.6;

	--fc-radius-xs: 2px;
	--fc-radius-sm: 4px;
	--fc-radius-md: 6px;
	--fc-radius-lg: 8px;
	--fc-radius-pill: 999px;

	--fc-space-half: 2px;
	--fc-space-1: 4px;
	--fc-space-2: 6px;
	--fc-space-3: 8px;
	--fc-space-4: 12px;
	--fc-space-5: 14px;
	--fc-space-6: 16px;
	--fc-space-7: 20px;
	--fc-space-8: 24px;
	--fc-space-9: 28px;
	--fc-space-10: 40px;

	--fc-control-sm: 28px;
	--fc-control-md: 32px;
	--fc-control-touch: 36px;
	--fc-header-height: 44px;
	--fc-home-header-max-width: 1280px;

	/* ── 文本层级 ───────────────────────────────────────────── */
	--fc-text: var(--text-normal);
	--fc-muted: var(--text-muted);
	--fc-faint: var(--text-faint);

	/* ── 语义状态色（主色=青，危险=红；其余为无语义调色板）────────── */
	--fc-cyan: var(--interactive-accent);
	--fc-blue: var(--color-blue);
	--fc-magenta: var(--color-pink);
	--fc-violet: var(--color-purple);
	--fc-lime: var(--color-green);
	--fc-amber: var(--color-yellow);
	--fc-red: var(--color-red);
	--fc-orange: var(--color-orange);
	--fc-primary: var(--fc-cyan);
	--fc-danger: var(--fc-red);

	/* ── 表面层级（画布 → 区块 → 卡片 → 浮层 → 控件）───────────── */
	--fc-bg-elevated: var(--background-primary);
	--fc-bg-panel: color-mix(
		in srgb,
		var(--background-secondary) 58%,
		var(--background-primary) 42%
	);
	--fc-bg-panel-soft: var(--interactive-normal);
	--fc-surface-canvas: var(--background-secondary);
	/* 用 text-normal 混入 4% 以确保卡片在任何主题下都比纯底色更“凸显” */
	--fc-surface-card: color-mix(in srgb, var(--background-primary) 96%, var(--text-normal) 4%);
	--fc-surface-section: var(--fc-bg-panel);
	--fc-surface-raised: color-mix(in srgb, var(--background-primary) 88%, var(--text-normal) 12%);
	--fc-surface-control: var(--interactive-normal);
	--fc-surface-header-status: color-mix(in srgb, var(--interactive-accent) 10%, transparent);

	/* ── 交互状态表面（hover / 选中）与禁用透明度 ───────────────── */
	--fc-surface-hover: color-mix(
		in srgb,
		var(--interactive-accent) 12%,
		var(--background-secondary) 88%
	);
	--fc-surface-selected: color-mix(
		in srgb,
		var(--interactive-accent) 22%,
		var(--background-primary) 78%
	);
	--fc-surface-complete: rgba(var(--fc-lime-rgb), 0.1);
	/* 禁用态统一用透明度表达，不再单独定义禁用表面色 */
	--fc-opacity-disabled: 0.45;

	/* ── 边框与分隔线 ────────────────────────────────────────── */
	--fc-line: var(--background-modifier-border);
	--fc-line-strong: color-mix(
		in srgb,
		var(--background-modifier-border-focus) 80%,
		var(--interactive-accent) 20%
	);
	--fc-line-soft: color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
	--fc-line-faint: color-mix(in srgb, var(--background-modifier-border) 35%, transparent);

	/* ── 控件表面与边框 ──────────────────────────────────────── */
	--fc-control-bg: var(--fc-surface-control);
	--fc-control-bg-hover: var(--fc-surface-hover);
	--fc-control-border: var(--background-modifier-border);
	--fc-control-border-hover: color-mix(in srgb, var(--interactive-accent) 30%, var(--fc-line));
	--fc-control-border-selected: color-mix(
		in srgb,
		var(--interactive-accent) 78%,
		var(--text-normal) 22%
	);
	--fc-compact-control-border: var(--background-modifier-border);

	/* ── 输入框 ─────────────────────────────────────────────── */
	--fc-input-bg: color-mix(
		in srgb,
		var(--background-primary) 96%,
		var(--background-secondary) 4%
	);
	--fc-input-bg-hover: color-mix(in srgb, var(--interactive-accent) 5%, var(--fc-input-bg) 95%);
	--fc-input-border: color-mix(
		in srgb,
		var(--background-modifier-border-hover) 58%,
		var(--text-muted) 42%
	);
	--fc-input-border-focus: var(--fc-control-border-selected);

	/* ── 首页主操作（学习 / 刷题）────────────────────────────── */
	--fc-action-study-start: var(--interactive-accent);
	--fc-action-study-end: var(--interactive-accent-hover);
	--fc-action-study-text: var(--text-on-accent);
	/* 第二主题色（刷题按钮文字/描边）：取主题自带的 --secondary-color，随主题色联动；
	   未定义该变量的主题退回“主题蓝淡化”的淡蓝 */
	--fc-secondary: var(
		--secondary-color,
		color-mix(in srgb, var(--fc-blue) 50%, rgb(var(--fc-white-rgb)))
	);
	/* 刷题（第二主题色）：第二主题色文字 + 同色系 tint 底，与学习（青）实底区分 */
	--fc-action-practice-start: color-mix(in srgb, var(--fc-secondary) 18%, var(--fc-surface-card));
	--fc-action-practice-end: color-mix(in srgb, var(--fc-secondary) 32%, var(--fc-surface-card));
	--fc-action-practice-text: var(--fc-secondary);

	/* ── RGB 通道（仅用于 rgba() 半透明 tint）──────────────────── */
	--fc-bg-rgb: var(--mono-rgb-0);
	--fc-bg-elevated-rgb: var(--mono-rgb-0);
	--fc-bg-panel-rgb: var(--mono-rgb-0);
	/* 主色 RGB：优先取主题交互强调色的 RGB 通道；部分主题未定义
	   --interactive-accent-rgb，依次回退到强调色 / 主题蓝的 RGB 通道 */
	--fc-cyan-rgb: var(--color-cyan-rgb);
	--fc-blue-rgb: var(--color-blue-rgb);
	--fc-magenta-rgb: var(--color-pink-rgb);
	--fc-violet-rgb: var(--color-purple-rgb);
	--fc-lime-rgb: var(--color-green-rgb);
	--fc-amber-rgb: var(--color-yellow-rgb);
	--fc-red-rgb: var(--color-red-rgb);
	--fc-orange-rgb: var(--color-orange-rgb);
	/* 固定纯黑/纯白，不随主题翻转：黑用于阴影与遮罩，白用于高光 sheen */
	--fc-black-rgb: 0, 0, 0;
	--fc-white-rgb: 255, 255, 255;

	/* ── 遮罩（backdrop scrim）──────────────────────────────── */
	--fc-overlay: rgba(var(--fc-black-rgb), 0.74);
	--fc-overlay-heavy: rgba(var(--fc-black-rgb), 0.76);

	--fc-font-ui:
		ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	--fc-font-reading: "Songti SC", STSong, "Noto Serif CJK SC", Georgia, serif;
	--fc-font-data: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
	--fc-shadow-sm: 0 1px 2px rgba(var(--fc-black-rgb), 0.05);
	--fc-shadow:
		0 4px 12px rgba(var(--fc-black-rgb), 0.08), 0 1px 3px rgba(var(--fc-black-rgb), 0.04);
	--fc-shadow-popover:
		0 8px 24px rgba(var(--fc-black-rgb), 0.12), 0 2px 6px rgba(var(--fc-black-rgb), 0.08);
	--fc-shadow-overlay:
		0 24px 64px rgba(var(--fc-black-rgb), 0.16), 0 8px 16px rgba(var(--fc-black-rgb), 0.1);
	--fc-focus-ring: 0 0 0 3px rgba(var(--fc-cyan-rgb), 0.22);
	--fc-glow-cyan: none;
	--fc-glow-magenta: none;
	--fc-motion-quick: 140ms;
	--fc-motion-base: 180ms;
	--fc-motion-page: 220ms;
	--fc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
	--fc-ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1);
	--fc-transition-lift:
		transform var(--fc-motion-base) var(--fc-ease-out), border-color var(--fc-motion-base) ease,
		box-shadow var(--fc-motion-base) ease, background var(--fc-motion-base) ease;
	--fc-transition-button:
		transform var(--fc-motion-quick) var(--fc-ease-snap),
		box-shadow var(--fc-motion-quick) ease, border-color var(--fc-motion-quick) ease,
		background var(--fc-motion-quick) ease, color var(--fc-motion-quick) ease;
	--fc-transition-card-switch:
		opacity var(--fc-motion-base) ease, transform var(--fc-motion-base) var(--fc-ease-snap),
		filter var(--fc-motion-base) ease, border-color var(--fc-motion-base) ease,
		box-shadow var(--fc-motion-base) ease;
	--fc-transition-progress:
		width var(--fc-motion-page) var(--fc-ease-out), box-shadow var(--fc-motion-base) ease;
	--fc-transition-word-cell:
		transform var(--fc-motion-quick) var(--fc-ease-out),
		border-color var(--fc-motion-quick) ease, box-shadow var(--fc-motion-quick) ease,
		background var(--fc-motion-quick) ease;
	--fc-transition-modal-control:
		transform var(--fc-motion-quick) var(--fc-ease-out),
		border-color var(--fc-motion-quick) ease, box-shadow var(--fc-motion-quick) ease;
	--fc-transition-fast: var(--fc-motion-quick) var(--fc-ease-out);
	--fc-motion-page-enter: fc-enter var(--fc-motion-page) var(--fc-ease-out) both;
	--fc-motion-rise: fc-rise-in var(--fc-motion-page) var(--fc-ease-out) both;
	--fc-motion-current-day: fc-rise-in var(--fc-motion-page) var(--fc-ease-out) both;
	--fc-motion-answer: fc-answer-reveal var(--fc-motion-base) var(--fc-ease-out) both;
	--fc-motion-divider: fc-divider-scan 820ms var(--fc-ease-out) both;
	--fc-motion-active-glow: fc-active-glow var(--fc-motion-page) var(--fc-ease-out) both;
	--fc-motion-choice-pulse: fc-choice-pulse 300ms var(--fc-ease-out) both;
	--fc-motion-progress-scan: none;
	--fc-motion-complete-pop: fc-complete-pop 420ms var(--fc-ease-out) both;
	--fc-motion-soft-pulse: fc-soft-pulse 1.4s ease-out 1;
	--fc-motion-fade-in: fc-fade-in var(--fc-motion-quick) ease-out both;
	--fc-motion-modal-in: fc-modal-in 240ms var(--fc-ease-out) both;
	--fc-motion-sheen: none;
	--fc-motion-spin: fc-spin 1s linear infinite;

	font-family: var(--fc-font-ui);
	font-size: var(--fc-font-md);
	font-weight: var(--fc-weight-regular);
	line-height: var(--fc-line-body);
	color: var(--fc-text);
}

/*
 * Root frame: layout skeleton plus the neutral canvas surface.
 * This is the only static .flashcard-root definition; editorial.css only
 * adjusts it responsively via @container queries.
 */
.flashcard-root {
	position: relative;
	box-sizing: border-box;
	height: 100%;
	min-height: 100%;
	overflow: hidden;
	overscroll-behavior: contain;
	display: flex;
	flex-direction: column;
	container-name: flashcard-page;
	container-type: inline-size;
	padding: var(--fc-space-2);
	border-radius: var(--fc-radius-md);
	scrollbar-gutter: auto;
}

.flashcard-root > * {
	position: relative;
	z-index: 1;
}

.workspace-leaf-content .flashcard-container {
	height: 100%;
	overflow: hidden;
	overscroll-behavior: contain;
	padding: 0;
}

/* Shared utilities */
.blue {
	color: var(--fc-blue) !important;
}

.green {
	color: var(--fc-lime) !important;
}

.purple {
	color: var(--fc-violet) !important;
}

.orange {
	color: var(--fc-orange) !important;
}

.red {
	color: var(--fc-red) !important;
}

.fc-kicker {
	display: inline-flex;
	align-items: center;
	gap: var(--fc-space-2);
	border-radius: var(--fc-radius-xs);
	white-space: nowrap;
	padding: var(--fc-space-1) var(--fc-space-2);
	border: 1px solid rgba(var(--fc-cyan-rgb), 0.28);
	background: rgba(var(--fc-cyan-rgb), 0.08);
	color: var(--fc-primary);
	font-size: var(--fc-font-xs);
	font-weight: var(--fc-weight-semibold);
	text-transform: uppercase;
}

.fc-lift {
	transition: var(--fc-transition-lift);
	transform: none;
}

.fc-lift:hover {
	border-color: rgba(var(--fc-cyan-rgb), 0.38);
	box-shadow: var(--fc-glow-cyan);
	transform: none;
}
```

### mixins.scss

```scss
// =============================================================================
// WSR Flash Card SCSS Mixins
// =============================================================================

// 焦点环样式，对齐系统规范
@mixin fc-focus-ring {
	outline: none;
	box-shadow: var(--fc-focus-ring);
}

// 弹性居中
@mixin fc-flex-center {
	display: flex;
	align-items: center;
	justify-content: center;
}

// 弹性行并垂直居中
@mixin fc-flex-row-center {
	display: flex;
	align-items: center;
}

// 弹性两端对齐
@mixin fc-flex-between {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

// 单行文本截断
@mixin fc-truncate {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

// 多行文本截断
@mixin fc-line-clamp($lines: 2) {
	display: -webkit-box;
	-webkit-line-clamp: $lines;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

// 按钮原生重置
@mixin fc-button-reset {
	appearance: none;
	background: transparent;
	border: none;
	padding: 0;
	margin: 0;
	font: inherit;
	color: inherit;
	cursor: pointer;
	text-align: inherit;

	&:disabled {
		cursor: not-allowed;
		opacity: var(--fc-opacity-disabled);
	}
}

// 自定义精细滚动条
@mixin fc-scrollbar {
	scrollbar-width: thin;
	scrollbar-color: var(--fc-scrollbar-thumb) transparent;

	&::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	&::-webkit-scrollbar-track {
		background: transparent;
	}

	&::-webkit-scrollbar-thumb {
		background: var(--fc-scrollbar-thumb);
		border-radius: var(--fc-radius-pill);

		&:hover {
			background: var(--fc-scrollbar-thumb-hover);
		}
	}
}
```

### motion.scss

```scss
/* Form focus and scrollbars */
.flashcard-root input:focus,
.flashcard-root select:focus,
.flashcard-root textarea:focus,
.flashcard-settings-tab input:focus,
.flashcard-settings-tab select:focus,
.flashcard-root button:focus-visible,
.flashcard-settings-tab button:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px rgba(var(--fc-cyan-rgb), 0.24);
	border-color: rgba(var(--fc-cyan-rgb), 0.5);
}

.flashcard-root ::-webkit-scrollbar,
.flashcard-settings-tab ::-webkit-scrollbar {
	display: none;
	width: 0;
	height: 0;
}

.flashcard-root,
.flashcard-settings-tab {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.spinning {
	animation: var(--fc-motion-spin);
}

/* Motion */
@keyframes fc-enter {
	from {
		opacity: 0;
		transform: translateY(16px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes fc-rise-in {
	from {
		opacity: 0;
		transform: translateY(18px) scale(0.976);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes fc-answer-reveal {
	from {
		opacity: 0;
		transform: translateY(14px) scale(0.984);
		filter: blur(1px) saturate(0.7);
	}
	62% {
		opacity: 1;
		transform: translateY(-2px) scale(1.004);
		filter: blur(0) saturate(1.12);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
		filter: saturate(1);
	}
}

@keyframes fc-divider-scan {
	from {
		transform: translateX(-110%);
	}
	to {
		transform: translateX(110%);
	}
}

@keyframes fc-active-glow {
	0% {
		box-shadow: 0 0 0 rgba(var(--fc-magenta-rgb), 0);
	}
	70% {
		box-shadow:
			var(--fc-glow-magenta),
			0 0 34px rgba(var(--fc-magenta-rgb), 0.28),
			0 0 18px rgba(var(--fc-cyan-rgb), 0.14);
	}
	100% {
		box-shadow: var(--fc-glow-magenta);
	}
}

@keyframes fc-choice-pulse {
	0% {
		box-shadow: 0 0 0 rgba(var(--fc-cyan-rgb), 0);
		transform: scale(0.965);
	}
	55% {
		box-shadow:
			0 0 0 2px rgba(var(--fc-cyan-rgb), 0.42),
			0 0 30px rgba(var(--fc-cyan-rgb), 0.26);
		transform: scale(1.018);
	}
	100% {
		box-shadow: 0 0 0 1px rgba(var(--fc-cyan-rgb), 0.18);
		transform: scale(1);
	}
}

@keyframes fc-soft-pulse {
	0%,
	100% {
		transform: scale(1);
		box-shadow: none;
	}
	50% {
		transform: scale(1.06);
		box-shadow:
			0 0 28px rgba(var(--fc-cyan-rgb), 0.22),
			0 0 44px rgba(var(--fc-lime-rgb), 0.14);
	}
}

@keyframes fc-current-day-pulse {
	0%,
	100% {
		transform: scale(1);
		box-shadow: none;
	}
	50% {
		transform: scale(1.005);
		box-shadow:
			0 0 7px rgba(var(--fc-cyan-rgb), 0.22),
			0 0 10px rgba(var(--fc-lime-rgb), 0.14);
	}
}

@keyframes fc-complete-pop {
	from {
		opacity: 0;
		transform: translateY(18px) scale(0.94);
	}
	64% {
		opacity: 1;
		transform: translateY(-3px) scale(1.018);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes fc-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@keyframes fc-modal-in {
	from {
		opacity: 0;
		transform: translateY(18px) scale(0.96);
	}
	to {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes fc-sheen {
	0%,
	32% {
		transform: translateX(-120%);
	}
	54%,
	100% {
		transform: translateX(120%);
	}
}

@keyframes fc-progress-scan {
	from {
		transform: translateX(-110%);
	}
	to {
		transform: translateX(110%);
	}
}

@keyframes fc-spin {
	to {
		transform: rotate(360deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.flashcard-root *,
	.flashcard-root *::before,
	.flashcard-root *::after,
	.flashcard-settings-tab *,
	.flashcard-settings-tab *::before,
	.flashcard-settings-tab *::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
	}

	.flashcard-content.animating {
		opacity: 1;
		transform: none;
		filter: none;
		box-shadow: none;
	}

	.flashcard-study-day-item.current {
		animation-iteration-count: 1 !important;
	}
}

@media (prefers-reduced-motion: reduce) {
	.flashcard-root *,
	.flashcard-root *::before,
	.flashcard-root *::after {
		scroll-behavior: auto !important;
		animation-duration: 1ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 1ms !important;
	}
}
```
