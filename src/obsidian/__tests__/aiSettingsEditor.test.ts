import { describe, expect, it, vi } from "vitest";
import { Notice } from "obsidian";
import { AiSettingsEditor } from "../aiSettingsEditor";
import type { AiEngineConfig, AiService, AiSnapshot } from "../../ai";

vi.mock("obsidian", () => ({
	Notice: vi.fn(),
}));

function createMockService(initialConfigs: AiEngineConfig[] = []) {
	let configs = [...initialConfigs];
	let defaultConfigId: string | null = configs[0]?.id ?? null;
	const listeners = new Set<() => void>();

	const getSnapshot = vi.fn((): AiSnapshot => ({
		settings: { configs, defaultConfigId },
		models: {},
		loadingModels: [],
		testing: [],
	}));

	const subscribe = vi.fn((cb: () => void) => {
		listeners.add(cb);
		return () => listeners.delete(cb);
	});

	const saveConfig = vi.fn(async (draft: Partial<AiEngineConfig>) => {
		const id = draft.id ?? `engine-${configs.length + 1}`;
		const saved: AiEngineConfig = {
			id,
			name: draft.name ?? "",
			provider: draft.provider ?? "deepseek",
			baseUrl: draft.baseUrl ?? "",
			secretId: draft.secretId ?? "",
			model: draft.model ?? "",
		};
		const idx = configs.findIndex((c) => c.id === id);
		if (idx >= 0) {
			configs[idx] = saved;
		} else {
			configs.push(saved);
		}
		return id;
	});

	const deleteConfig = vi.fn(async (id: string) => {
		configs = configs.filter((c) => c.id !== id);
		if (defaultConfigId === id) defaultConfigId = null;
	});

	const setDefault = vi.fn(async (id: string | null) => {
		defaultConfigId = id;
	});

	const listModels = vi.fn(async () => []);
	const testConnection = vi.fn(async () => {});

	const service = {
		getSnapshot,
		subscribe,
		saveConfig,
		deleteConfig,
		setDefault,
		listModels,
		testConnection,
	} as unknown as AiService;

	return {
		service,
		getConfigs: () => configs,
		saveConfig,
		deleteConfig,
		testConnection,
	};
}

describe("AiSettingsEditor navigation and operations", () => {
	it("starts on list view and transitions to form view on clicking Add Engine", () => {
		const config: AiEngineConfig = {
			id: "c1",
			name: "My DeepSeek",
			provider: "deepseek",
			baseUrl: "https://api.deepseek.com",
			secretId: "key-1",
			model: "deepseek-v4-flash",
		};
		const { service } = createMockService([config]);
		const refresh = vi.fn();
		const editor = new AiSettingsEditor(service, () => "zh", refresh);
		editor.activate();

		// 1. Initial list view
		let def = editor.definitions();
		expect(def.heading).toBe("AI 引擎");
		const addBtn = def.items
			.find((item) => item.name === "已配置引擎")
			?.controls?.find((c) => c.type === "button" && c.label === "新增引擎");
		expect(addBtn).toBeDefined();

		// Item row with edit and delete buttons
		const itemRow = def.items.find((item) => item.name.includes("My DeepSeek"));
		expect(itemRow).toBeDefined();
		const editBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "编辑");
		const deleteBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "删除");
		expect(editBtn).toBeDefined();
		expect(deleteBtn).toBeDefined();

		// 2. Click Add Engine -> switches to secondary form view
		if (addBtn?.type !== "button") throw new Error("Missing add button");
		void addBtn.onClick();
		expect(refresh).toHaveBeenCalled();

		def = editor.definitions();
		expect(def.heading).toContain("新增 AI 引擎");
		const backBtn = def.items
			.find((item) => item.name === "返回列表")
			?.controls?.find((c) => c.type === "button");
		expect(backBtn).toBeDefined();
	});

	it("tests connection from within secondary form view and returns to list view upon save", async () => {
		const { service, saveConfig, testConnection } = createMockService([]);
		const refresh = vi.fn();
		const editor = new AiSettingsEditor(service, () => "zh", refresh);
		editor.activate();

		// Enter secondary form page
		const addBtn = editor
			.definitions()
			.items.find((item) => item.name === "已配置引擎")
			?.controls?.find((c) => c.type === "button" && c.label === "新增引擎");
		if (addBtn?.type !== "button") throw new Error("Missing add button");
		void addBtn.onClick();

		let formDef = editor.definitions();

		// Fill in fields
		const nameInput = formDef.items.find((i) => i.name === "配置名称")?.controls?.[0];
		const modelInput = formDef.items.find((i) => i.name === "模型 ID")?.controls?.[0];
		const secretInput = formDef.items.find((i) => i.name === "API Key")?.controls?.[0];
		if (
			nameInput?.type !== "text" ||
			modelInput?.type !== "text" ||
			secretInput?.type !== "secret"
		) {
			throw new Error("Missing inputs");
		}
		void nameInput.onChange("New Engine");
		void modelInput.onChange("model-abc");
		void secretInput.onChange("secret-ref");

		// Test connection inside secondary form view
		const testBtn = formDef.items
			.find((i) => i.name === "测试连接")
			?.controls?.find((c) => c.type === "button");
		if (testBtn?.type !== "button") throw new Error("Missing test button");
		await testBtn.onClick();
		expect(testConnection).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "New Engine",
				model: "model-abc",
				secretId: "secret-ref",
			}),
		);
		expect(Notice).toHaveBeenCalledWith("AI 文本连接测试成功");

		// Save configuration
		const saveBtn = formDef.items
			.find((i) => i.name === "引擎配置")
			?.controls?.find((c) => c.type === "button" && c.label === "保存配置");
		if (saveBtn?.type !== "button") throw new Error("Missing save button");
		await saveBtn.onClick();

		expect(saveConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "New Engine",
				model: "model-abc",
				secretId: "secret-ref",
			}),
		);
		expect(Notice).toHaveBeenCalledWith("AI 引擎配置已保存");

		// After successful save, automatically returns to list view
		const listDef = editor.definitions();
		expect(listDef.heading).toBe("AI 引擎");
		const newEngineRow = listDef.items.find((i) => i.name.includes("New Engine"));
		expect(newEngineRow).toBeDefined();
	});

	it("edits an existing engine and saves back to list view", async () => {
		const initial: AiEngineConfig = {
			id: "eng-1",
			name: "Old Name",
			provider: "deepseek",
			baseUrl: "https://api.deepseek.com",
			secretId: "key-1",
			model: "deepseek-v4-flash",
		};
		const { service, saveConfig } = createMockService([initial]);
		const refresh = vi.fn();
		const editor = new AiSettingsEditor(service, () => "zh", refresh);
		editor.activate();

		// Click Edit
		const listDef = editor.definitions();
		const itemRow = listDef.items.find((i) => i.name.includes("Old Name"));
		const editBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "编辑");
		if (editBtn?.type !== "button") throw new Error("Missing edit button");
		void editBtn.onClick();

		// Form view
		let formDef = editor.definitions();
		expect(formDef.heading).toContain("编辑 AI 引擎");
		const nameInput = formDef.items.find((i) => i.name === "配置名称")?.controls?.[0];
		if (nameInput?.type !== "text") throw new Error("Missing name input");
		void nameInput.onChange("Renamed Engine");

		// Save
		const saveBtn = formDef.items
			.find((i) => i.name === "引擎配置")
			?.controls?.find((c) => c.type === "button" && c.label === "保存配置");
		if (saveBtn?.type !== "button") throw new Error("Missing save button");
		await saveBtn.onClick();

		expect(saveConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "eng-1",
				name: "Renamed Engine",
			}),
		);

		// Returns to list view
		const afterSaveDef = editor.definitions();
		expect(afterSaveDef.heading).toBe("AI 引擎");
		expect(afterSaveDef.items.find((i) => i.name.includes("Renamed Engine"))).toBeDefined();
	});

	it("deletes an engine from the list view", async () => {
		const initial: AiEngineConfig = {
			id: "eng-to-delete",
			name: "To Delete",
			provider: "deepseek",
			baseUrl: "https://api.deepseek.com",
			secretId: "key-1",
			model: "deepseek-v4-flash",
		};
		const { service, deleteConfig, getConfigs } = createMockService([initial]);
		const refresh = vi.fn();
		const editor = new AiSettingsEditor(service, () => "zh", refresh);
		editor.activate();

		const listDef = editor.definitions();
		const itemRow = listDef.items.find((i) => i.name.includes("To Delete"));
		const deleteBtn = itemRow?.controls?.find((c) => c.type === "button" && c.label === "删除");
		if (deleteBtn?.type !== "button") throw new Error("Missing delete button");
		await deleteBtn.onClick();

		expect(deleteConfig).toHaveBeenCalledWith("eng-to-delete");
		expect(getConfigs()).toHaveLength(0);
		expect(Notice).toHaveBeenCalledWith("AI 引擎配置已删除");

		// Stays on list view and shows empty hint
		const afterDeleteDef = editor.definitions();
		expect(afterDeleteDef.heading).toBe("AI 引擎");
		expect(afterDeleteDef.items.find((i) => i.name === "暂无已配置的引擎")).toBeDefined();
	});

	it("can return from form view without saving via back button", () => {
		const { service } = createMockService([]);
		const refresh = vi.fn();
		const editor = new AiSettingsEditor(service, () => "zh", refresh);
		editor.activate();

		// Go to add
		const addBtn = editor
			.definitions()
			.items.find((item) => item.name === "已配置引擎")
			?.controls?.find((c) => c.type === "button" && c.label === "新增引擎");
		if (addBtn?.type !== "button") throw new Error("Missing add button");
		void addBtn.onClick();

		expect(editor.definitions().heading).toContain("新增 AI 引擎");

		// Click back
		const backBtn = editor
			.definitions()
			.items.find((item) => item.name === "返回列表")
			?.controls?.find((c) => c.type === "button");
		if (backBtn?.type !== "button") throw new Error("Missing back button");
		void backBtn.onClick();

		// Back on list view
		expect(editor.definitions().heading).toBe("AI 引擎");
	});
});
