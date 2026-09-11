import { Notice, type Command } from "obsidian";
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

it("keeps newer translation settings and AI settings when a stale whole-settings save is queued", async () => {
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
	Reflect.set(plugin, "updateLocalizedControls", () => {});
	const persist: (settings: TranslationSettings) => Promise<void> = Reflect.get(
		plugin,
		"persistTranslationSettings",
	);
	const translation: TranslationSettings = {
		...plugin.settings.translation,
		enabled: true,
		direction: "en-zh",
		promptTemplate: "Translate with context",
	};
	const ai = plugin.settings.ai;
	const stale = {
		...plugin.settings,
		dailyNewCards: 7,
		translation: plugin.settings.translation,
	};
	await Promise.all([persist(translation), plugin.saveSettings(stale)]);

	expect(plugin.settings.translation).toEqual(translation);
	expect(plugin.dataStore.getSettings().translation).toEqual(translation);
	expect(plugin.settings.ai).toEqual(ai);
});

it("reports translation view open failures without rejecting or exposing internal errors", async () => {
	const app = {
		workspace: {
			getLeavesOfType: () => [],
			getLeaf: () => ({
				setViewState: vi.fn().mockRejectedValue(new Error("private diagnostic")),
			}),
		},
	};
	const plugin = new FlashcardPlugin(app as never, {} as never);
	plugin.app = app as never;
	await expect(plugin.activateTranslationView()).resolves.toBeUndefined();
	expect(Notice).toHaveBeenLastCalledWith("无法打开翻译视图，请重试。");
});

it("only prefills the selection after command execution, without translating or changing the note", () => {
	const plugin = new FlashcardPlugin({} as never, {} as never);
	plugin.settings = {
		...DEFAULT_SETTINGS,
		translation: { ...DEFAULT_SETTINGS.translation, enabled: true },
	};
	const commands: Command[] = [];
	vi.spyOn(plugin, "addCommand").mockImplementation((command) => {
		commands.push(command);
		return command;
	});
	const open = vi.spyOn(plugin, "activateTranslationView").mockResolvedValue(undefined);
	const runtime = { prefill: vi.fn(), translate: vi.fn() };
	Reflect.set(plugin, "translationRuntime", runtime);
	const register: () => void = Reflect.get(plugin, "updateTranslationControls");
	register.call(plugin);
	const command = commands.find((command) => command.id === "translate-selection");
	const editor = { getSelection: () => "selected text", replaceSelection: vi.fn() };
	expect(command?.editorCheckCallback?.(true, editor as never, {} as never)).toBe(true);
	expect(runtime.prefill).not.toHaveBeenCalled();
	expect(command?.editorCheckCallback?.(false, editor as never, {} as never)).toBe(true);
	expect(runtime.prefill).toHaveBeenCalledWith("selected text");
	expect(open).toHaveBeenCalledOnce();
	expect(runtime.translate).not.toHaveBeenCalled();
	expect(editor.replaceSelection).not.toHaveBeenCalled();
});
