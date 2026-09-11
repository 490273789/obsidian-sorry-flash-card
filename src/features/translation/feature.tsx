import { Notice } from "obsidian";
import type { AiService } from "../../core/ai";
import type { OutboundPort } from "../../core/net";
import { translationStrings } from "./strings/translation";
import { translationSettingsStrings } from "./strings/settings";
import { normalizeTranslationSettings } from "./domain/configuration";
import { TranslationRuntime } from "./domain/translationRuntime";
import { detectTranslationDirection } from "./domain/selectionDirection";
import { translateYoudao } from "./domain/youdao";
import { createSharedTranslator } from "../../core/i18n";
import { TranslatorView } from "./ui";
import { createReactItemView } from "../../core/host/reactItemView";
import { TranslationSettingsEditor } from "./obsidian/settingsEditor";
import type {
	WorkbenchModule,
	WorkbenchHost,
	WorkbenchSettingsSection,
} from "../../core/host/workbench";
import type { SelectionTranslationAdapter } from "../../core/selectionHelper/domain/types";

/** Settings section id this feature contributes. */
export const TRANSLATION_SECTION_ID = "translation";

/** Obsidian view type of the translator view. */
export const VIEW_TYPE_TRANSLATOR = "flashcard-translator-view";

const OPEN_COMMAND_ID = "open-ai-translator";
const SELECTION_COMMAND_ID = "translate-selection";

export interface TranslationFeatureDeps {
	ai: AiService;
	net: OutboundPort;
}

export interface TranslationFeature extends WorkbenchModule {
	readonly selectionAdapter: SelectionTranslationAdapter;
}

/**
 * The AI 翻译 workbench feature: the translator view and its settings section.
 * Owns its runtime, its chrome, and its persisted settings slice.
 */
export function createTranslationFeature(deps: TranslationFeatureDeps): TranslationFeature {
	let runtime: TranslationRuntime | null = null;
	let editor: TranslationSettingsEditor | null = null;
	/** Open-view lease handed to the runtime; the last view closing clears the session. */
	let detachOpenView: (() => void) | null = null;
	let activeHost: WorkbenchHost | null = null;

	const ensureRuntime = (host: WorkbenchHost): TranslationRuntime => {
		if (runtime) return runtime;
		runtime = new TranslationRuntime(host.settings().translation, deps.ai, {
			persist: async (translation) => {
				await host.updateSettings({
					translation: normalizeTranslationSettings(translation),
				});
			},
			youdao: (connection, text, direction, signal) =>
				translateYoudao(connection, text, direction, deps.net, signal),
		});
		return runtime;
	};

	const activateView = async (host: WorkbenchHost): Promise<void> => {
		try {
			await host.activateView(VIEW_TYPE_TRANSLATOR);
		} catch {
			new Notice(translationStrings(host.settings().language).openFailed);
		}
	};

	const selectionAdapter: SelectionTranslationAdapter = {
		available: () => Boolean(activeHost?.settings().translation.enabled),
		openPrefilled: async (text) => {
			if (!activeHost) return;
			const translation = ensureRuntime(activeHost);
			const direction = detectTranslationDirection(text);
			const snapshot = translation.getSnapshot();
			if (snapshot.settings.direction !== direction) {
				await translation.configure({ ...snapshot.settings, direction });
			}
			translation.prefill(text);
			try {
				await activeHost.activateView(VIEW_TYPE_TRANSLATOR, { mainTab: true });
			} catch {
				new Notice(translationStrings(activeHost.settings().language).openFailed);
			}
		},
	};

	const section = (
		host: WorkbenchHost,
		translation: TranslationRuntime,
	): WorkbenchSettingsSection => {
		editor ??= new TranslationSettingsEditor(
			translation,
			deps.ai,
			() => host.settings().language,
			() => host.settingsTab.refresh(),
		);
		const settingsEditor = editor;
		return {
			id: TRANSLATION_SECTION_ID,
			order: 2,
			label: (language) => translationSettingsStrings(language).heading,
			definitions: () => [settingsEditor.definitions()],
			activate: () => settingsEditor.activate(),
			hide: () => settingsEditor.hide(),
		};
	};

	return {
		id: "translation",

		render: (host) => {
			activeHost = host;
			const translation = ensureRuntime(host);

			host.registerView(
				VIEW_TYPE_TRANSLATOR,
				createReactItemView({
					type: VIEW_TYPE_TRANSLATOR,
					icon: "languages",
					title: (language) => translationStrings(language).title,
					readSettings: () => host.settings(),
					renderErrorMessage: (language) =>
						createSharedTranslator(language)("notice.viewRenderFailed"),
					onOpen: () => {
						detachOpenView = translation.attachView();
					},
					onClose: () => {
						detachOpenView?.();
						detachOpenView = null;
					},
					render: ({ language }) => (
						<TranslatorView
							runtime={translation}
							language={language}
							onOpenSettings={() => host.settingsTab.open(TRANSLATION_SECTION_ID)}
						/>
					),
				}),
			);

			host.catalog({
				id: "translation",
				icon: "languages",
				title: (language) => translationStrings(language).title,
				openCommandId: OPEN_COMMAND_ID,
				openHotkeys: [{ modifiers: ["Alt"], key: "3" }],
				settingsSectionId: TRANSLATION_SECTION_ID,
				available: () => host.settings().translation.enabled,
				open: () => {
					void activateView(host);
				},
			});

			const strings = translationStrings(host.settings().language);
			host.chrome((chrome) => {
				if (!host.settings().translation.enabled) return;
				chrome.command({
					id: SELECTION_COMMAND_ID,
					name: strings.selectionCommand,
					selection: {
						// Prefilling only: translating always needs an explicit action.
						run: (selection) => {
							translation.prefill(selection);
							void activateView(host);
						},
					},
				});
			});

			host.settingsSection(section(host, translation));
		},

		stop: () => {
			activeHost = null;
			runtime?.dispose();
			runtime = null;
		},

		selectionAdapter,
	};
}
