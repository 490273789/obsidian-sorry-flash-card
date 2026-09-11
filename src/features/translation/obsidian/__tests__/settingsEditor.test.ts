import { describe, expect, it, vi } from "vitest";
import { Notice } from "obsidian";
import type { AiService, AiSnapshot } from "../../../../core/ai";
import type { TranslationSettings, TranslationSnapshot } from "../../domain/types";
import { TranslationSettingsEditor, type TranslationSettingsRuntime } from "../settingsEditor";

vi.mock("obsidian", () => ({ Notice: vi.fn() }));

function snapshot(settings: TranslationSettings): TranslationSnapshot {
	return { settings, input: "", results: [], status: "idle", saving: false, testing: false };
}

function createRuntime(initial: TranslationSettings) {
	let settings = initial;
	const configure = vi.fn(async (next: TranslationSettings) => {
		settings = next;
	});
	const testYoudao = vi.fn(async () => {});
	const setSettings = (next: TranslationSettings) => {
		settings = next;
	};
	const runtime: TranslationSettingsRuntime = {
		getSnapshot: () => snapshot(settings),
		subscribe: vi.fn(() => () => {}),
		configure,
		testYoudao,
	};
	return { runtime, configure, testYoudao, settings: () => settings, setSettings };
}

function createAi(): AiService {
	const snapshot: AiSnapshot = {
		settings: {
			configs: [
				{
					id: "deepseek",
					name: "DeepSeek",
					provider: "deepseek",
					baseUrl: "https://api.deepseek.com",
					secretId: "secret",
					model: "chat",
				},
			],
			defaultConfigId: null,
		},
		models: {},
		loadingModels: [],
		testing: [],
	};
	return {
		getSnapshot: () => snapshot,
		subscribe: vi.fn(() => () => {}),
	} as unknown as AiService;
}

const initial: TranslationSettings = {
	enabled: false,
	direction: "zh-en",
	profiles: [{ id: "first", name: "First", enabled: true, kind: "engine", configId: "deepseek" }],
	promptTemplate: "Prompt",
	thinkingEnabled: false,
	youdao: {
		baseUrl: "https://youdao.example",
		appKeySecretId: "key",
		appSecretSecretId: "secret",
	},
};

describe("TranslationSettingsEditor", () => {
	it("edits one full draft and persists only when Save is clicked", async () => {
		const { runtime, configure, settings, setSettings } = createRuntime(initial);
		const refresh = vi.fn();
		const editor = new TranslationSettingsEditor(runtime, createAi(), () => "zh", refresh);
		const definition = editor.definitions();
		const enabled = definition.items.find((item) => item.name === "启用 AI 翻译")
			?.controls?.[0];
		if (enabled?.type !== "toggle") throw new Error("Missing enabled toggle");
		void enabled.onChange(true);
		expect(configure).not.toHaveBeenCalled();

		const add = definition.items
			.find((item) => item.name === "翻译方案")
			?.controls?.find((control) => control.type === "button");
		if (add?.type !== "button") throw new Error("Missing add profile button");
		void add.onClick();
		setSettings({ ...settings(), direction: "en-zh" });

		const save = editor
			.definitions()
			.items.find((item) => item.name === "AI 翻译")
			?.controls?.find((control) => control.type === "button");
		if (save?.type !== "button") throw new Error("Missing save button");
		await save.onClick();
		expect(configure).toHaveBeenCalledOnce();
		expect(settings().enabled).toBe(true);
		expect(settings().profiles).toHaveLength(2);
		expect(configure).toHaveBeenCalledWith(expect.objectContaining({ direction: "en-zh" }));
		expect(Notice).toHaveBeenCalledWith("翻译设置已保存");
	});

	it("does not let a profile be removed below one and tests the saved Youdao connection explicitly", async () => {
		const { runtime, configure, testYoudao } = createRuntime(initial);
		const editor = new TranslationSettingsEditor(runtime, createAi(), () => "en", vi.fn());
		const definition = editor.definitions();
		const remove = definition.items
			.find((item) => item.name === "Order and removal")
			?.controls?.find((control) => control.type === "button" && control.label === "Delete");
		expect(remove).toMatchObject({ disabled: true });
		const test = definition.items.find((item) => item.name === "Test Youdao connection")
			?.controls?.[0];
		if (test?.type !== "button") throw new Error("Missing test button");
		await test.onClick();
		expect(testYoudao).toHaveBeenCalledOnce();
		expect(configure).not.toHaveBeenCalled();
	});
});
