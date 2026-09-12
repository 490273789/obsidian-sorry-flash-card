import { describe, expect, it, vi } from "vitest";
import { buildTranslationSettingsViewModel } from "../viewModel";
import type {
	TranslationSettingsEditorActions,
	TranslationSettingsEditorState,
} from "../viewModel";

function setup(): {
	state: TranslationSettingsEditorState;
	actions: TranslationSettingsEditorActions;
} {
	const state: TranslationSettingsEditorState = {
		saving: false,
		snapshot: {
			input: "",
			results: [],
			status: "idle",
			saving: false,
			testing: false,
			settings: {
				enabled: false,
				direction: "zh-en",
				profiles: [
					{
						id: "engine",
						name: "Primary",
						enabled: true,
						kind: "engine",
						configId: "deepseek",
					},
					{ id: "youdao", name: "Youdao", enabled: true, kind: "youdao", configId: "" },
				],
				promptTemplate: "Translate {source_language} to {target_language}",
				thinkingEnabled: false,
				youdao: {
					baseUrl: "https://youdao.example",
					appKeySecretId: "app",
					appSecretSecretId: "secret",
				},
			},
		},
		draft: {
			enabled: false,
			direction: "zh-en",
			profiles: [
				{
					id: "engine",
					name: "Primary",
					enabled: true,
					kind: "engine",
					configId: "deepseek",
				},
				{ id: "youdao", name: "Youdao", enabled: true, kind: "youdao", configId: "" },
			],
			promptTemplate: "Translate {source_language} to {target_language}",
			thinkingEnabled: false,
			youdao: {
				baseUrl: "https://youdao.example",
				appKeySecretId: "app",
				appSecretSecretId: "secret",
			},
		},
		aiSnapshot: {
			settings: {
				configs: [
					{
						id: "deepseek",
						name: "Translation",
						provider: "deepseek",
						baseUrl: "https://api.deepseek.com",
						secretId: "key",
						model: "deepseek-chat",
					},
					{
						id: "gateway",
						name: "Gateway",
						provider: "youdao",
						baseUrl: "https://gateway",
						secretId: "key",
						model: "model",
					},
				],
				defaultConfigId: null,
			},
			models: {},
			loadingModels: [],
			testing: [],
		},
	};
	return {
		state,
		actions: {
			patch: vi.fn(),
			patchProfile: vi.fn(),
			addProfile: vi.fn(),
			removeProfile: vi.fn(),
			moveProfile: vi.fn(),
			resetPrompt: vi.fn(),
			save: vi.fn(),
			testYoudao: vi.fn(),
		},
	};
}

describe("translation settings definitions", () => {
	it("keeps only supported configured AI engines selectable and exposes the dedicated Youdao secrets", () => {
		const { state, actions } = setup();
		const groups = buildTranslationSettingsViewModel(state, actions, "zh");
		const allItems = groups.flatMap((g) => g.items);
		const profileCards = allItems.find((item) => item.controls?.[0]?.type === "profileCards")
			?.controls?.[0];
		if (profileCards?.type !== "profileCards") throw new Error("Missing profileCards control");
		expect(profileCards.items[0]!.engineOptions.map((option) => option.value)).toEqual([
			"",
			"deepseek",
		]);
		expect(allItems.find((item) => item.name === "应用 ID 密钥")?.controls?.[0]).toMatchObject({
			type: "secret",
			value: "app",
		});
	});

	it("organizes settings into clear sections and groups profiles into cards", () => {
		const { state, actions } = setup();
		const groups = buildTranslationSettingsViewModel(state, actions, "zh");
		expect(groups).toHaveLength(5);
		expect(groups.map((g) => g.heading)).toEqual([
			"常规设置",
			"翻译方案管理",
			"提示词模板",
			"有道翻译连接",
			"保存设置",
		]);

		const allItems = groups.flatMap((g) => g.items);
		const profileCards = allItems.find((item) => item.controls?.[0]?.type === "profileCards")
			?.controls?.[0];
		if (profileCards?.type !== "profileCards") throw new Error("Missing profileCards control");
		expect(profileCards.items).toHaveLength(2);
		expect(profileCards.items[0]!.badge).toBe("方案 1");
		expect(profileCards.items[0]!.name).toBe("Primary");
		expect(profileCards.items[0]!.enabled).toBe(true);
		expect(profileCards.items[0]!.canMoveUp).toBe(false);
		expect(profileCards.items[0]!.canMoveDown).toBe(true);
		expect(profileCards.items[0]!.canRemove).toBe(true);
		expect(profileCards.items[0]!.engineOptions[0]).toEqual({
			value: "",
			label: "选择 AI 引擎",
		});
	});

	it("keeps a deleted selected engine visible so it can be repaired", () => {
		const { state, actions } = setup();
		state.draft.profiles[0] = { ...state.draft.profiles[0]!, configId: "deleted" };
		const groups = buildTranslationSettingsViewModel(state, actions, "en");
		const allItems = groups.flatMap((g) => g.items);
		const profileCards = allItems.find((item) => item.controls?.[0]?.type === "profileCards")
			?.controls?.[0];
		if (profileCards?.type !== "profileCards") throw new Error("Missing profileCards control");
		expect(profileCards.items[0]!.engineOptions).toContainEqual({
			value: "deleted",
			label: "Deleted engine configuration",
		});
	});

	it("uses semantic actions for profile management, prompt reset, and testing saved Youdao configuration", () => {
		const { state, actions } = setup();
		const groups = buildTranslationSettingsViewModel(state, actions, "en");
		const allItems = groups.flatMap((g) => g.items);
		const profileCards = allItems.find((item) => item.controls?.[0]?.type === "profileCards")
			?.controls?.[0];
		if (profileCards?.type !== "profileCards") throw new Error("Missing profileCards control");

		profileCards.items[0]!.onMoveDown();
		expect(actions.moveProfile).toHaveBeenCalledWith("engine", 1);

		const reset = allItems
			.find((item) => item.name === "Translation prompt")
			?.controls?.find((control) => control.type === "button");
		if (reset?.type !== "button") throw new Error("Missing reset button");
		void reset.onClick();
		expect(actions.resetPrompt).toHaveBeenCalledOnce();

		const test = allItems.find((item) => item.name === "Test Youdao connection")?.controls?.[0];
		if (test?.type !== "button") throw new Error("Missing Youdao test button");
		void test.onClick();
		expect(actions.testYoudao).toHaveBeenCalledOnce();
	});
});
