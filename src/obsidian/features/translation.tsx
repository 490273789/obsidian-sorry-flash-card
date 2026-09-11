import { Notice, requestUrl } from "obsidian";
import type { AiService } from "../../ai";
import { translationStrings } from "../../i18n/translation";
import { translationSettingsStrings } from "../../i18n/translationSettings";
import { normalizeTranslationSettings } from "../../translation/configuration";
import { TranslationRuntime } from "../../translation/translationRuntime";
import { translateYoudao } from "../../translation/youdao";
import { createTranslator } from "../../i18n";
import { TranslatorView } from "../../ui/views/Translator";
import { createReactItemView } from "../reactItemView";
import { TranslationSettingsEditor } from "../translationSettingsEditor";
import type { WorkbenchFeature, WorkbenchHost, WorkbenchSettingsSection } from "../workbench";

/** Settings section id this feature contributes. */
export const TRANSLATION_SECTION_ID = "translation";

/** Obsidian view type of the translator view. */
export const VIEW_TYPE_TRANSLATOR = "flashcard-translator-view";

const OPEN_COMMAND_ID = "open-ai-translator";
const SELECTION_COMMAND_ID = "translate-selection";

export interface TranslationFeatureDeps {
	ai: AiService;
}

/**
 * The AI 翻译 workbench feature: the translator view and its settings section.
 * Owns its runtime, its chrome, and its persisted settings slice.
 */
export function createTranslationFeature(deps: TranslationFeatureDeps): WorkbenchFeature {
	let runtime: TranslationRuntime | null = null;
	let editor: TranslationSettingsEditor | null = null;
	/** Open-view lease handed to the runtime; the last view closing clears the session. */
	let detachOpenView: (() => void) | null = null;

	const ensureRuntime = (host: WorkbenchHost): TranslationRuntime => {
		if (runtime) return runtime;
		runtime = new TranslationRuntime(host.settings().translation, deps.ai, {
			persist: async (translation) => {
				await host.updateSettings({
					translation: normalizeTranslationSettings(translation),
				});
			},
			youdao: (connection, text, direction, signal) =>
				translateYoudao(
					connection,
					text,
					direction,
					{
						readSecret: (id) => host.app.secretStorage.getSecret(id),
						request: async (request) => {
							const response = await requestUrl({ ...request, throw: false });
							return { status: response.status, text: response.text };
						},
					},
					signal,
				),
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
			const translation = ensureRuntime(host);

			host.registerView(
				VIEW_TYPE_TRANSLATOR,
				createReactItemView({
					type: VIEW_TYPE_TRANSLATOR,
					icon: "languages",
					title: (language) => translationStrings(language).title,
					containerClass: "flashcard-translator-container",
					rootClass: "flashcard-translator-root",
					readSettings: () => host.settings(),
					renderErrorMessage: (language) =>
						createTranslator(language)("notice.viewRenderFailed"),
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

			const strings = translationStrings(host.settings().language);
			host.chrome((chrome) => {
				if (!host.settings().translation.enabled) return;
				chrome.ribbon("languages", strings.title, () => {
					void activateView(host);
				});
				chrome.command({
					id: OPEN_COMMAND_ID,
					name: strings.title,
					run: () => {
						void activateView(host);
					},
				});
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
			runtime?.dispose();
			runtime = null;
		},
	};
}
