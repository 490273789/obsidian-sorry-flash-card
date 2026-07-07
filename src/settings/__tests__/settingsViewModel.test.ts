import { describe, expect, it, vi } from "vitest";
import { buildSettingsViewModel, type SettingsViewModelActions } from "../settingsViewModel";
import { DEFAULT_SETTINGS, type FlashcardSettings } from "../../shared/types";

function makeSettings(overrides: Partial<FlashcardSettings> = {}): FlashcardSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
		fsrsParameters: {
			...DEFAULT_SETTINGS.fsrsParameters,
			...overrides.fsrsParameters,
		},
		deckStudySettings: overrides.deckStudySettings ?? {},
	};
}

function makeActions(): SettingsViewModelActions {
	return {
		refreshTags: vi.fn(),
		updateFlashcardTag: vi.fn(),
		addFlashcardTag: vi.fn(),
		removeFlashcardTag: vi.fn(),
		addDiscoveredTag: vi.fn(),
		setLanguage: vi.fn(),
		setDailyNewCards: vi.fn(),
		setDailyReviewCards: vi.fn(),
		setStudyOrder: vi.fn(),
		setRequestRetention: vi.fn(),
		setMaximumInterval: vi.fn(),
	};
}

describe("buildSettingsViewModel", () => {
	it("builds the full settings group tree without Obsidian types", () => {
		const actions = makeActions();
		const model = buildSettingsViewModel(
			{
				settings: makeSettings({ flashcardTags: ["#单词"] }),
				availableTags: ["#单词", "#短语"],
				isLoadingTags: false,
				hasLoadedTags: true,
				language: "zh",
			},
			actions,
		);

		expect(model.map((group) => group.heading)).toEqual([
			"闪卡设置",
			"界面设置",
			"默认学习设置（全局兜底）",
			"Fsrs 算法参数",
			"使用说明",
		]);
		expect(model.flatMap((group) => group.items).map((item) => item.name)).toContain(
			"闪卡标签",
		);
	});

	it("exposes refresh, editable tag list, and discovered tag actions", () => {
		const actions = makeActions();
		const model = buildSettingsViewModel(
			{
				settings: makeSettings({ flashcardTags: ["#word"] }),
				availableTags: ["#word", "#phrase"],
				isLoadingTags: false,
				hasLoadedTags: true,
				language: "en",
			},
			actions,
		);
		const flashcardItems = model[0]!.items;
		const configuredTagControls = flashcardItems[0]!.controls ?? [];
		const discoveredTagControls = flashcardItems[1]!.controls ?? [];
		const refreshAndClean = configuredTagControls[0]!;
		const tagList = configuredTagControls[1]!;
		const discoveredTags = discoveredTagControls[1]!;

		expect(refreshAndClean).toMatchObject({
			type: "button",
			label: "Refresh and clean",
			disabled: false,
		});
		if (refreshAndClean.type !== "button") throw new Error("Expected button control");
		void refreshAndClean.onClick();
		expect(actions.refreshTags).toHaveBeenCalledWith({ cleanConfiguredTags: true });

		if (tagList.type !== "editableTextList") {
			throw new Error("Expected editable text list control");
		}
		void tagList.onChange(0, "#updated");
		void tagList.onAdd();
		void tagList.onRemove(0);
		expect(actions.updateFlashcardTag).toHaveBeenCalledWith(0, "#updated");
		expect(actions.addFlashcardTag).toHaveBeenCalledTimes(1);
		expect(actions.removeFlashcardTag).toHaveBeenCalledWith(0);

		if (discoveredTags.type !== "tagButtons") {
			throw new Error("Expected tag button control");
		}
		expect(discoveredTags.tags).toEqual(["#phrase"]);
		void discoveredTags.onClick("#phrase");
		expect(actions.addDiscoveredTag).toHaveBeenCalledWith("#phrase");
	});

	it("shows loading and empty discovered-tag states", () => {
		const loadingModel = buildSettingsViewModel(
			{
				settings: makeSettings(),
				availableTags: [],
				isLoadingTags: true,
				hasLoadedTags: false,
				language: "zh",
			},
			makeActions(),
		);
		const loadingButton = loadingModel[0]!.items[1]!.controls?.[0];
		expect(loadingButton).toMatchObject({
			type: "button",
			label: "刷新中...",
			disabled: true,
		});

		const unloadedModel = buildSettingsViewModel(
			{
				settings: makeSettings(),
				availableTags: [],
				isLoadingTags: false,
				hasLoadedTags: false,
				language: "zh",
			},
			makeActions(),
		);
		const unloadedTags = unloadedModel[0]!.items[1]!.controls?.[1];
		expect(unloadedTags).toMatchObject({
			type: "tagButtons",
			tags: [],
			emptyText: "点击刷新扫描可用标签",
		});

		const loadedModel = buildSettingsViewModel(
			{
				settings: makeSettings(),
				availableTags: [],
				isLoadingTags: false,
				hasLoadedTags: true,
				language: "zh",
			},
			makeActions(),
		);
		const loadedTags = loadedModel[0]!.items[1]!.controls?.[1];
		expect(loadedTags).toMatchObject({
			type: "tagButtons",
			tags: [],
			emptyText: "暂无可添加的标签",
		});
	});

	it("wires language, study, and FSRS controls to semantic actions", () => {
		const actions = makeActions();
		const model = buildSettingsViewModel(
			{
				settings: makeSettings({
					language: "zh",
					dailyNewCards: 12,
					dailyReviewCards: 80,
					studyOrder: "random",
					fsrsParameters: {
						requestRetention: 0.88,
						maximumInterval: 500,
					},
				}),
				availableTags: [],
				isLoadingTags: false,
				hasLoadedTags: true,
				language: "zh",
			},
			actions,
		);
		const language = model[1]!.items[0]!.controls?.[0];
		const dailyNew = model[2]!.items[1]!.controls?.[0];
		const dailyReview = model[2]!.items[2]!.controls?.[0];
		const studyOrder = model[2]!.items[3]!.controls?.[0];
		const retention = model[3]!.items[0]!.controls?.[0];
		const maximumInterval = model[3]!.items[1]!.controls?.[0];

		if (language?.type !== "select") throw new Error("Expected language select");
		void language.onChange("en");
		expect(actions.setLanguage).toHaveBeenCalledWith("en");

		if (dailyNew?.type !== "slider") throw new Error("Expected daily new slider");
		void dailyNew.onChange(20);
		expect(actions.setDailyNewCards).toHaveBeenCalledWith(20);

		if (dailyReview?.type !== "slider") throw new Error("Expected daily review slider");
		void dailyReview.onChange(100);
		expect(actions.setDailyReviewCards).toHaveBeenCalledWith(100);

		if (studyOrder?.type !== "select") throw new Error("Expected study order select");
		void studyOrder.onChange("sequential");
		expect(actions.setStudyOrder).toHaveBeenCalledWith("sequential");

		if (retention?.type !== "slider") throw new Error("Expected retention slider");
		void retention.onChange(0.9);
		expect(actions.setRequestRetention).toHaveBeenCalledWith(0.9);

		if (maximumInterval?.type !== "integerText") {
			throw new Error("Expected maximum interval text");
		}
		void maximumInterval.onChange(365);
		expect(actions.setMaximumInterval).toHaveBeenCalledWith(365);
	});

	it("keeps help content semantic instead of constructing DOM", () => {
		const model = buildSettingsViewModel(
			{
				settings: makeSettings(),
				availableTags: [],
				isLoadingTags: false,
				hasLoadedTags: true,
				language: "zh",
			},
			makeActions(),
		);
		const help = model[4]!.items[0]!.help;

		expect(help?.cardFormatTitle).toBe("卡片格式说明:");
		expect(help?.cardFormatExample).toContain("??");
		expect(help?.shortcuts).toContain("数字6: 上一题");
	});
});
