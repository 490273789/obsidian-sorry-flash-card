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
		const model = buildTranslationSettingsViewModel(state, actions, "zh");
		const engine = model.items.find((item) => item.name === "AI 引擎配置")?.controls?.[0];
		if (engine?.type !== "select") throw new Error("Missing engine configuration selector");
		expect(engine.options.map((option) => option.value)).toEqual(["", "deepseek"]);
		expect(
			model.items.find((item) => item.name === "应用 ID 密钥")?.controls?.[0],
		).toMatchObject({
			type: "secret",
			value: "app",
		});
	});

	it("splits each profile into narrow setting rows", () => {
		const { state, actions } = setup();
		const model = buildTranslationSettingsViewModel(state, actions, "zh");
		expect(model.items.find((item) => item.name === "方案 1")?.controls).toHaveLength(2);
		expect(model.items.find((item) => item.name === "翻译方式")?.controls).toHaveLength(1);
		expect(model.items.find((item) => item.name === "排序与删除")?.controls).toHaveLength(3);
		const engine = model.items.find((item) => item.name === "AI 引擎配置")?.controls?.[0];
		if (engine?.type !== "select") throw new Error("Missing engine configuration selector");
		expect(engine.options[0]).toEqual({ value: "", label: "选择 AI 引擎" });
	});

	it("keeps a deleted selected engine visible so it can be repaired", () => {
		const { state, actions } = setup();
		state.draft.profiles[0] = { ...state.draft.profiles[0]!, configId: "deleted" };
		const model = buildTranslationSettingsViewModel(state, actions, "en");
		const engine = model.items.find((item) => item.name === "AI engine configuration")
			?.controls?.[0];
		if (engine?.type !== "select") throw new Error("Missing engine configuration selector");
		expect(engine.options).toContainEqual({
			value: "deleted",
			label: "Deleted engine configuration",
		});
	});

	it("uses semantic actions for profile management, prompt reset, and testing saved Youdao configuration", () => {
		const { state, actions } = setup();
		const model = buildTranslationSettingsViewModel(state, actions, "en");
		const actionsRow = model.items.find((item) => item.name === "Order and removal");
		const moveDown = actionsRow?.controls?.find(
			(control) => control.type === "button" && control.label === "Move down",
		);
		if (moveDown?.type !== "button") throw new Error("Missing move button");
		void moveDown.onClick();
		expect(actions.moveProfile).toHaveBeenCalledWith("engine", 1);

		const reset = model.items
			.find((item) => item.name === "Translation prompt")
			?.controls?.find((control) => control.type === "button");
		if (reset?.type !== "button") throw new Error("Missing reset button");
		void reset.onClick();
		expect(actions.resetPrompt).toHaveBeenCalledOnce();

		const test = model.items.find((item) => item.name === "Test Youdao connection")
			?.controls?.[0];
		if (test?.type !== "button") throw new Error("Missing Youdao test button");
		void test.onClick();
		expect(actions.testYoudao).toHaveBeenCalledOnce();
	});
});
