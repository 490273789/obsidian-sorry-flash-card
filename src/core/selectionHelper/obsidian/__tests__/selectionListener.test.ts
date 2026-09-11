import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SelectionHelper } from "../../domain/selectionHelper";
import { SelectionListener } from "../selectionListener";

const rootSpies = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));

vi.mock("react-dom/client", () => ({
	createRoot: () => rootSpies,
}));

describe("SelectionListener", () => {
	let addEventListenerSpy: ReturnType<typeof vi.fn>;
	let removeEventListenerSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		rootSpies.render.mockReset();
		rootSpies.unmount.mockReset();
		addEventListenerSpy = vi.fn();
		removeEventListenerSpy = vi.fn();

		vi.stubGlobal("document", {
			addEventListener: addEventListenerSpy,
			removeEventListener: removeEventListenerSpy,
			createElement: vi.fn(() => ({
				className: "",
				contains: vi.fn(() => false),
				appendChild: vi.fn(),
				remove: vi.fn(),
			})),
			body: { appendChild: vi.fn() },
		});
	});

	it("passes note selections to the deep module and unmounts on outside input", () => {
		const handlers = new Map<string, (event: MouseEvent) => void>();
		addEventListenerSpy.mockImplementation((type, listener) => {
			handlers.set(type, listener);
		});
		vi.stubGlobal("window", {
			getSelection: () => ({ toString: () => "hello" }),
		});
		const helper = new SelectionHelper({
			settings: () => ({ enabled: true, modifier: "none", selectedDictionaries: [] }),
			dictionary: {
				sources: () => [{ id: "youdao", label: "有道", kind: "dictionary" }],
				startLookup: () => null,
				openInMainTab: vi.fn().mockResolvedValue(undefined),
			},
			translation: {
				available: () => true,
				openPrefilled: vi.fn().mockResolvedValue(undefined),
			},
		});
		const listener = new SelectionListener({ helper, getLanguage: () => "zh" });
		listener.start();

		handlers.get("mouseup")?.({
			target: { closest: () => ({}) },
			clientX: 12,
			clientY: 24,
			altKey: false,
			shiftKey: false,
			ctrlKey: false,
			metaKey: false,
		} as unknown as MouseEvent);

		expect(helper.getSnapshot().target?.text).toBe("hello");
		expect(rootSpies.render).toHaveBeenCalledOnce();

		handlers.get("mousedown")?.({ target: {} } as MouseEvent);
		expect(helper.getSnapshot().visible).toBe(false);
		expect(rootSpies.unmount).toHaveBeenCalledOnce();
		listener.stop();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("registers mouseup, mousedown, and scroll listeners on start", () => {
		const helper = new SelectionHelper({
			settings: () => ({ enabled: true, modifier: "none", selectedDictionaries: [] }),
			dictionary: {
				sources: () => [],
				startLookup: () => null,
				openInMainTab: vi.fn().mockResolvedValue(undefined),
			},
			translation: {
				available: () => false,
				openPrefilled: vi.fn().mockResolvedValue(undefined),
			},
		});
		const listener = new SelectionListener({
			helper,
			getLanguage: () => "zh",
		});

		listener.start();
		expect(addEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
		expect(addEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function), true);
		expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);

		listener.stop();
		expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
		expect(removeEventListenerSpy).toHaveBeenCalledWith(
			"mousedown",
			expect.any(Function),
			true,
		);
		expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
	});
});
