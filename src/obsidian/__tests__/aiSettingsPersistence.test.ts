import { expect, it, vi } from "vitest";
import FlashcardPlugin from "../main";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import type { AiSettings } from "../../ai";
import type { TranslationSettings } from "../../translation/types";

vi.mock("obsidian", () => ({
	Plugin: class {
		removeCommand() {}
		addRibbonIcon() {
			return { remove() {} };
		}
		addCommand() {
			return {};
		}
		registerView() {}
		registerEvent() {}
	},
	ItemView: class {},
	WorkspaceLeaf: class {},
	Modal: class {},
	Notice: vi.fn(),
	Platform: { isDesktopApp: true },
}));
vi.mock("../FlashcardView", () => ({ FlashcardView: class {}, VIEW_TYPE_FLASHCARD: "flashcard" }));
vi.mock("../TranslatorView", () => ({
	TranslatorItemView: class {},
	VIEW_TYPE_TRANSLATOR: "translator",
}));
vi.mock("../settingsTab", () => ({ FlashcardSettingTab: class {} }));
vi.mock("../aiAdapter", () => ({ createObsidianAiService: vi.fn() }));
vi.mock("../../pronunciation", () => ({ createPronunciationRuntime: vi.fn() }));
vi.mock("../../decks/deckPdfExporter", () => ({ exportDeckToPdf: vi.fn() }));

/**
 * The composition root's settings writer is the only path a feature may use, so
 * these tests guard that a queued patch is applied to the settings committed at
 * write time, and that it never resurrects a slice another feature changed.
 */
async function createPlugin() {
	const app = { workspace: { getLeavesOfType: () => [] }, vault: { getMarkdownFiles: () => [] } };
	const host = {
		app,
		loadData: vi.fn().mockResolvedValue(null),
		saveData: vi.fn().mockResolvedValue(undefined),
	};
	const plugin = new FlashcardPlugin(app as never, {} as never);
	plugin.app = app as never;
	plugin.dataStore = new DataStore(host as never);
	plugin.settings = await plugin.dataStore.loadSettings();
	const commit: (patch: Partial<typeof plugin.settings>) => Promise<void> = Reflect.get(
		plugin,
		"commitSettings",
	);
	return { plugin, commit };
}

it("applies concurrent feature patches to the settings committed at write time", async () => {
	const { plugin, commit } = await createPlugin();
	const persistAi: (ai: AiSettings) => Promise<void> = Reflect.get(plugin, "persistAiSettings");
	const ai: AiSettings = {
		configs: [
			{
				id: "engine",
				name: "Translate",
				provider: "deepseek",
				baseUrl: "https://api.deepseek.com",
				secretId: "key-id",
				model: "deepseek-v4-flash",
			},
		],
		defaultConfigId: "engine",
	};

	await Promise.all([
		persistAi(ai),
		commit({ dailyNewCards: 42 }),
		commit({ studyOrder: "sequential" }),
	]);

	// Every patch survives; none of them overwrote a slice it did not mention.
	expect(plugin.settings.ai).toEqual(ai);
	expect(plugin.settings.dailyNewCards).toBe(42);
	expect(plugin.settings.studyOrder).toBe("sequential");
	const stored = plugin.dataStore.getSettings();
	expect(stored.ai).toEqual(ai);
	expect(stored.dailyNewCards).toBe(42);
	expect(stored.studyOrder).toBe("sequential");
});

it("keeps feature slices independent of each other", async () => {
	const { plugin, commit } = await createPlugin();
	const translation: TranslationSettings = {
		...plugin.settings.translation,
		enabled: true,
		direction: "en-zh",
		promptTemplate: "Translate with context",
	};
	const ai = plugin.settings.ai;

	await commit({ translation });
	await commit({ dailyReviewCards: 7 });

	expect(plugin.settings.translation).toEqual(translation);
	expect(plugin.settings.ai).toEqual(ai);
	expect(plugin.settings.dailyReviewCards).toBe(7);
	const stored = plugin.dataStore.getSettings();
	expect(stored.translation).toEqual(translation);
	expect(stored.dailyReviewCards).toBe(7);
});

it("publishes settings that still contain every slice the host owns", async () => {
	const { plugin, commit } = await createPlugin();

	await commit({ language: "en" });

	expect(plugin.settings.language).toBe("en");
	expect(plugin.settings.flashcardTags).toEqual(DEFAULT_SETTINGS.flashcardTags);
	expect(plugin.settings.pronunciation).toEqual(DEFAULT_SETTINGS.pronunciation);
	expect(plugin.settings.dictionary).toEqual(DEFAULT_SETTINGS.dictionary);
});
