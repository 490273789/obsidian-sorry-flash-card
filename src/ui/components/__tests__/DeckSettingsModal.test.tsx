import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DeckHomeSettingsDraft } from "../../../decks/deckHome";
import { DEFAULT_SETTINGS } from "../../../shared/types";
import { ModalProvider } from "../../modal";
import { I18nProvider } from "../I18nContext";
import { DeckSettingsModal } from "../DeckSettingsModal";

vi.mock("react-dom", async () => {
	const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
	return {
		...actual,
		createPortal: (children: React.ReactNode) => children,
	};
});

const host = {
	nodeType: 1,
	ownerDocument: {
		activeElement: null,
	},
} as unknown as HTMLElement;

function makeDraft(overrides: Partial<DeckHomeSettingsDraft> = {}): DeckHomeSettingsDraft {
	return {
		ownerId: "owner-1",
		deckId: "deck-1",
		deckName: "GRE 单词",
		filePath: "vocab/gre.md",
		totalCards: 100,
		useCustom: false,
		dailyNewCards: 20,
		dailyReviewCards: 50,
		studyOrder: "sequential",
		requestRetention: 0.9,
		maximumInterval: "365",
		daysToComplete: "5",
		wordLearningEnabled: false,
		global: {
			dailyNewCards: DEFAULT_SETTINGS.dailyNewCards,
			dailyReviewCards: DEFAULT_SETTINGS.dailyReviewCards,
			studyOrder: DEFAULT_SETTINGS.studyOrder,
			fsrsParameters: { ...DEFAULT_SETTINGS.fsrsParameters },
		},
		spelling: {
			canStart: true,
			hasStableIdentities: true,
			invalidCards: [],
		},
		...overrides,
	};
}

function renderModal(draft: DeckHomeSettingsDraft) {
	return renderToStaticMarkup(
		<I18nProvider language="zh">
			<ModalProvider host={host}>
				<DeckSettingsModal
					draft={draft}
					isSaving={false}
					isMigratingIdentity={false}
					onChange={vi.fn()}
					onSave={vi.fn()}
					onOpenSourceFile={vi.fn()}
					onMigrateIdentity={vi.fn()}
					onClose={vi.fn()}
				/>
			</ModalProvider>
		</I18nProvider>,
	);
}

describe("DeckSettingsModal", () => {
	it("renders global settings hint when useCustom is false", () => {
		const draft = makeDraft({ useCustom: false, totalCards: 100 });
		const html = renderModal(draft);

		expect(html).toContain("GRE 单词");
		expect(html).toContain("使用全局默认设置");
		expect(html).toContain("预计完成时间 5 天");
		expect(html).not.toContain("每日新卡数量");
	});

	it("renders custom fields when useCustom is true", () => {
		const draft = makeDraft({
			useCustom: true,
			totalCards: 100,
			dailyNewCards: 25,
			daysToComplete: "4",
		});
		const html = renderModal(draft);

		expect(html).toContain("使用自定义学习设置");
		expect(html).toContain("预计完成节奏");
		expect(html).toContain('value="25"');
		expect(html).toContain('value="4"');
		expect(html).toContain("每日新卡数量");
		expect(html).toContain("每日复习数量");
	});

	it("shows identity migration warning when word learning enabled without stable identities", () => {
		const draft = makeDraft({
			wordLearningEnabled: true,
			spelling: {
				canStart: false,
				hasStableIdentities: false,
				invalidCards: [],
			},
		});
		const html = renderModal(draft);

		expect(html).toContain("启用前需要先为题库写入稳定卡片身份");
		expect(html).toContain("开始迁移");
	});

	it("shows invalid cards warning when word learning has invalid spelling cards", () => {
		const draft = makeDraft({
			wordLearningEnabled: true,
			spelling: {
				canStart: true,
				hasStableIdentities: true,
				invalidCards: [
					{
						cardId: "c1",
						indexInFile: 2,
						front: "hello invalid 123",
					},
				],
			},
		});
		const html = renderModal(draft);

		expect(html).toContain("有 1 张卡片不符合单词拼写规则，拼写时将自动忽略");
		expect(html).toContain("第 3 张：hello invalid 123");
		expect(html).toContain("打开源文件");
	});
});
