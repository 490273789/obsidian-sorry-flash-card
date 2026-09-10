import { describe, expect, it, vi } from "vitest";
import {
	buildAiSettingsViewModel,
	type AiEditorActions,
	type AiEditorState,
} from "../aiSettingsViewModel";

function setup() {
	const draft = {
		id: "saved",
		name: "Translate",
		provider: "deepseek" as const,
		baseUrl: "https://api.deepseek.com",
		secretId: "secret-id",
		model: "deepseek-v4-flash",
	};
	const state: AiEditorState = {
		draft,
		saving: false,
		models: [],
		snapshot: {
			settings: { configs: [draft], defaultConfigId: "saved" },
			models: {},
			loadingModels: [],
			testing: [],
		},
	};
	const actions: AiEditorActions = {
		select: vi.fn(),
		add: vi.fn(),
		patch: vi.fn(),
		provider: vi.fn(),
		selectModel: vi.fn(),
		setDefault: vi.fn(),
		save: vi.fn(),
		remove: vi.fn(),
		loadModels: vi.fn(),
		test: vi.fn(),
	};
	return { state, actions };
}
describe("AI settings definitions", () => {
	it("keeps manual model input after discovery failure and saves through a semantic action", () => {
		const { state, actions } = setup();
		const model = buildAiSettingsViewModel(state, actions, "zh");
		const input = model.items.find((item) => item.name === "模型 ID")?.controls?.[0];
		if (input?.type !== "text") throw new Error("Missing manual model input");
		void input.onChange("custom-model");
		expect(actions.patch).toHaveBeenCalledWith({ model: "custom-model" });
		expect(actions.save).not.toHaveBeenCalled();
		const save = model.items
			.flatMap((item) => item.controls ?? [])
			.find((control) => control.type === "button" && control.label === "保存配置");
		if (save?.type !== "button") throw new Error("Missing save action");
		void save.onClick();
		expect(actions.save).toHaveBeenCalledOnce();
	});
	it("uses a secret reference control and disables testing for unsaved configurations", () => {
		const { state, actions } = setup();
		state.draft = { ...state.draft, id: "draft" };
		const model = buildAiSettingsViewModel(state, actions, "en");
		expect(model.items.find((item) => item.name === "API Key")?.controls?.[0]).toMatchObject({
			type: "secret",
			value: "secret-id",
		});
		expect(
			model.items.find((item) => item.name === "Test connection")?.controls?.[0],
		).toMatchObject({ type: "button", disabled: true });
	});
});
