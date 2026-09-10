import { describe, expect, it, vi } from "vitest";
import { FlashcardSettingTab } from "../settingsTab";
import { DEFAULT_SETTINGS } from "../../shared/types";

class MockElement {
	children: MockElement[] = [];
	classList = new Set<string>();
	listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
	attributes: Record<string, string> = {};
	text = "";
	inputEl = this;

	setPlaceholder() {
		return this;
	}
	setValue() {
		return this;
	}
	setDisabled() {
		return this;
	}
	getValue() {
		return "";
	}

	addClass(cls: string) {
		this.classList.add(cls);
		return this;
	}

	empty() {
		this.children = [];
		return this;
	}

	createDiv(options?: { cls?: string; text?: string }) {
		const div = new MockElement();
		if (options?.cls) div.classList.add(options.cls);
		if (options?.text) div.text = options.text;
		this.children.push(div);
		return div;
	}

	createEl(tag: string, options?: { type?: string; text?: string; cls?: string }) {
		const el = new MockElement();
		if (options?.cls) {
			for (const c of options.cls.split(" ")) {
				if (c) el.classList.add(c);
			}
		}
		if (options?.text) el.text = options.text;
		if (options?.type) el.attributes.type = options.type;
		this.children.push(el);
		return el;
	}

	createSpan(options?: { text?: string; cls?: string }) {
		return this.createEl("span", options);
	}

	addEventListener(event: string, fn: (...args: unknown[]) => void) {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event]!.push(fn);
	}

	click() {
		for (const fn of this.listeners.click ?? []) {
			fn();
		}
	}

	isShown() {
		return true;
	}
}

vi.mock("obsidian", () => ({
	PluginSettingTab: class {
		containerEl = new MockElement();
		app: unknown;
		plugin: unknown;
		constructor(app: unknown, plugin: unknown) {
			this.app = app;
			this.plugin = plugin;
		}
		hide() {}
	},
	Setting: class {
		descEl = new MockElement();
		controlEl = new MockElement();
		constructor(public parent: MockElement) {
			parent.children.push(this as unknown as MockElement);
		}
		setName() {
			return this;
		}
		setDesc() {
			return this;
		}
		setHeading() {
			return this;
		}
		addButton() {
			return this;
		}
		addDropdown() {
			return this;
		}
		addSlider() {
			return this;
		}
		addText() {
			return this;
		}

		addTextArea(cb?: (text: MockElement) => void) {
			cb?.(new MockElement());
			return this;
		}
		addToggle() {
			return this;
		}
	},
	SecretComponent: class {
		constructor() {}
		setValue() {
			return this;
		}
		setDisabled() {
			return this;
		}
		onChange() {
			return this;
		}
	},
	Notice: vi.fn(),
}));

(globalThis as unknown as { activeDocument: unknown }).activeDocument = {
	createDocumentFragment: () => new MockElement(),
};

describe("FlashcardSettingTab", () => {
	function createMockPlugin() {
		return {
			settings: { ...DEFAULT_SETTINGS },
			dataStore: {
				hasAvailableTagsSnapshot: () => true,
				getAvailableTags: () => ["#tag1", "#tag2"],
			},
			pronunciationRuntime: {
				subscribe: vi.fn(() => () => {}),
				getSnapshot: () => ({
					revision: 0,
					settings: { ...DEFAULT_SETTINGS.pronunciation },
					management: "idle",
					hasLocalEnglishVoice: false,
					voicesLoaded: true,
					speakingText: null,
					cacheUsage: { status: "ready", bytes: 0 },
				}),
				refreshCacheUsage: vi.fn(),
			},
			aiService: {
				subscribe: vi.fn(() => () => {}),
				getSnapshot: () => ({
					settings: {
						configs: [],
						defaultConfigId: null,
					},
					loadingModels: [],
					testing: [],
				}),
			},
			translationRuntime: {
				subscribe: vi.fn(() => () => {}),
				getSnapshot: () => ({
					settings: { ...DEFAULT_SETTINGS.translation },
					input: "",
					results: [],
					status: "idle",
					saving: false,
					testing: false,
				}),
			},
			saveSettings: vi.fn().mockResolvedValue(undefined),
		};
	}

	it("renders navigation bar with Flashcard, AI, and Translation tabs and defaults to Flashcard settings", () => {
		const plugin = createMockPlugin();
		const tab = new FlashcardSettingTab({} as never, plugin as never);
		tab.display();

		const container = tab.containerEl as unknown as MockElement;
		const navEl = container.children.find((c: MockElement) =>
			c.classList.has("fc-settings-tab-nav"),
		);
		expect(navEl).toBeDefined();

		const tabButtons =
			navEl?.children.filter((c: MockElement) => c.classList.has("fc-settings-tab-btn")) ??
			[];
		expect(tabButtons.length).toBe(3);
		expect(tabButtons[0]?.text).toBe("闪卡设置");
		expect(tabButtons[0]?.classList.has("is-active")).toBe(true);
		expect(tabButtons[1]?.text).toBe("AI 引擎设置");
		expect(tabButtons[1]?.classList.has("is-active")).toBe(false);
		expect(tabButtons[2]?.text).toContain("翻译");

		const contentEl = container.children.find((c: MockElement) =>
			c.classList.has("fc-settings-tab-content"),
		);
		expect(contentEl).toBeDefined();
	});

	it("renders translation settings without an empty content pane", () => {
		const plugin = createMockPlugin();
		const tab = new FlashcardSettingTab({} as never, plugin as never);
		tab.display();
		const container = tab.containerEl as unknown as MockElement;
		const navEl = container.children.find((c) => c.classList.has("fc-settings-tab-nav"));
		navEl?.children[2]?.click();
		const contentEl = (tab.containerEl as unknown as MockElement).children.find((c) =>
			c.classList.has("fc-settings-tab-content"),
		);
		expect(contentEl).toBeDefined();
		expect(contentEl?.children.length).toBeGreaterThan(0);
	});

	it("switches to AI settings tab when clicked", () => {
		const plugin = createMockPlugin();
		const tab = new FlashcardSettingTab({} as never, plugin as never);
		tab.display();

		const container = tab.containerEl as unknown as MockElement;
		const navEl = container.children.find((c: MockElement) =>
			c.classList.has("fc-settings-tab-nav"),
		);
		const aiTabBtn = navEl?.children[1];
		expect(aiTabBtn?.text).toBe("AI 引擎设置");

		aiTabBtn?.click();

		const newContainer = tab.containerEl as unknown as MockElement;
		const newNavEl = newContainer.children.find((c: MockElement) =>
			c.classList.has("fc-settings-tab-nav"),
		);
		const newButtons = newNavEl?.children ?? [];
		expect(newButtons[0]?.classList.has("is-active")).toBe(false);
		expect(newButtons[1]?.classList.has("is-active")).toBe(true);

		const contentEl = newContainer.children.find((c: MockElement) =>
			c.classList.has("fc-settings-tab-content"),
		);
		expect(contentEl).toBeDefined();
	});
});
