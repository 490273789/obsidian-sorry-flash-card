import { describe, expect, it, vi } from "vitest";
import {
	buildAiSettingsViewModel,
	type AiEditorActions,
	type AiEditorState,
} from "../aiSettingsViewModel";

function setup(view: "list" | "form" = "form") {
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
		view,
		draftIsNew: false,
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
		toAdd: vi.fn(),
		toEdit: vi.fn(),
		back: vi.fn(),
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
	it("renders list view with configured engines, edit and delete buttons, and add button", () => {
		const { state, actions } = setup("list");
		const model = buildAiSettingsViewModel(state, actions, "zh");

		// Header
		expect(model.heading).toBe("AI 引擎");

		// Default engine dropdown
		const defaultSetting = model.items.find((item) => item.name === "默认引擎");
		expect(defaultSetting).toBeDefined();

		// Add engine button
		const listSetting = model.items.find((item) => item.name === "已配置引擎");
		expect(listSetting).toBeDefined();
		const addBtn = listSetting?.controls?.find(
			(c) => c.type === "button" && c.label === "新增引擎",
		);
		expect(addBtn).toBeDefined();
		if (addBtn?.type !== "button") throw new Error("Missing add engine button");
		void addBtn.onClick();
		expect(actions.toAdd).toHaveBeenCalledOnce();

		// Configured item row with Edit and Delete buttons
		const itemRow = model.items.find((item) => item.name.includes("Translate"));
		expect(itemRow).toBeDefined();
		expect(itemRow?.desc).toContain("DeepSeek");
		const editBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "编辑");
		const removeBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "删除");
		expect(editBtn).toBeDefined();
		expect(removeBtn).toBeDefined();

		if (editBtn?.type !== "button" || removeBtn?.type !== "button") {
			throw new Error("Missing edit or remove buttons");
		}
		void editBtn.onClick();
		expect(actions.toEdit).toHaveBeenCalledWith("saved");

		void removeBtn.onClick();
		expect(actions.remove).toHaveBeenCalledWith("saved");
	});

	it("keeps manual model input after discovery failure and saves through a semantic action in form view", () => {
		const { state, actions } = setup("form");
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

	it("allows testing connection in form view and supports navigating back", () => {
		const { state, actions } = setup("form");
		state.draft = { ...state.draft, id: "draft" };
		state.draftIsNew = true;
		const model = buildAiSettingsViewModel(state, actions, "en");

		// API Key secret control
		expect(model.items.find((item) => item.name === "API Key")?.controls?.[0]).toMatchObject({
			type: "secret",
			value: "secret-id",
		});

		// Connection test button should be enabled in the form page for draft testing
		const testBtn = model.items.find((item) => item.name === "Test connection")?.controls?.[0];
		expect(testBtn).toMatchObject({ type: "button", disabled: false });
		if (testBtn?.type !== "button") throw new Error("Missing test button");
		void testBtn.onClick();
		expect(actions.test).toHaveBeenCalledOnce();

		// Back button
		const backBtn = model.items.find((item) => item.name === "Back to list")?.controls?.[0];
		expect(backBtn).toBeDefined();
		if (backBtn?.type !== "button") throw new Error("Missing back button");
		void backBtn.onClick();
		expect(actions.back).toHaveBeenCalledOnce();
	});
});
