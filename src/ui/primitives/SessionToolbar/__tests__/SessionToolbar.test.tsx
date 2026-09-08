import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../context/I18nContext";
import { SessionToolbar } from "../SessionToolbar";

function renderToolbar(
	autoPronunciation?: React.ComponentProps<typeof SessionToolbar>["autoPronunciation"],
): string {
	return renderToStaticMarkup(
		<I18nProvider language="zh">
			<SessionToolbar
				deckName="测试牌组"
				progress="1/10"
				progressPercent={10}
				startTime={Date.now()}
				onEdit={vi.fn()}
				onDelete={vi.fn()}
				onClose={vi.fn()}
				editTitle="编辑"
				deleteTitle="删除"
				closeTitle="关闭"
				autoPronunciation={autoPronunciation}
			/>
		</I18nProvider>,
	);
}

describe("SessionToolbar", () => {
	it("uses a single header without the session status badge", () => {
		const html = renderToolbar();

		expect(html).toContain("flashcard-session-header");
		expect(html).not.toContain("flashcard-session-toolbar");
		expect(html).not.toContain("学习中");
		expect(html).toContain("flashcard-menu-trigger");
	});

	it("places the disabled auto-pronunciation toggle before edit", () => {
		const html = renderToolbar({
			enabled: false,
			onToggle: vi.fn(),
			enableTitle: "开启自动发音",
			disableTitle: "关闭自动发音",
		});

		expect(html).toContain("flashcard-session-auto-pronunciation");
		expect(html).toContain('aria-label="开启自动发音"');
		expect(html).toContain('aria-pressed="false"');
		expect(html.indexOf('aria-label="开启自动发音"')).toBeLessThan(
			html.indexOf('aria-label="编辑"'),
		);
	});

	it("omits the toggle when word learning is not enabled", () => {
		expect(renderToolbar()).not.toContain("flashcard-session-auto-pronunciation");
	});
});
