import { expect, it, vi } from "vitest";
import FlashcardPlugin from "../main";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import type { AiSettings } from "../../ai";

vi.mock("obsidian", () => ({
	Plugin: class {},
	Modal: class {},
	Notice: vi.fn(),
	Platform: { isDesktopApp: true },
}));
vi.mock("../FlashcardView", () => ({ FlashcardView: class {}, VIEW_TYPE_FLASHCARD: "flashcard" }));
vi.mock("../settingsTab", () => ({ FlashcardSettingTab: class {} }));
vi.mock("../aiAdapter", () => ({ createObsidianAiService: vi.fn() }));
vi.mock("../../pronunciation", () => ({ createPronunciationRuntime: vi.fn() }));
vi.mock("../../decks/deckPdfExporter", () => ({ exportDeckToPdf: vi.fn() }));

it("keeps newer AI settings when a stale whole-settings save is queued", async () => {
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
	// Exercise the composition root's persistence callback without registering UI commands.
	Reflect.set(plugin, "updateLocalizedControls", () => {});
	const persist: (settings: AiSettings) => Promise<void> = Reflect.get(
		plugin,
		"persistAiSettings",
	);
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
	const stale = { ...plugin.settings, dailyNewCards: 42, ai: DEFAULT_SETTINGS.ai };
	const saveAi = persist(ai);
	const saveOrdinary = plugin.saveSettings(stale);
	await Promise.all([saveAi, saveOrdinary]);
	expect(plugin.settings.ai).toEqual(ai);
	expect(plugin.dataStore.getSettings().ai).toEqual(ai);
	expect(plugin.settings.dailyNewCards).toBe(42);
});
