import React from "react";
import type { Plugin } from "obsidian";
import { createSharedTranslator } from "../i18n";
import type { FlashcardSettings, Language } from "../shared/types";
import { FlashcardButton } from "../ui/primitives/Button";
import { createReactItemView } from "./reactItemView";
import type { Workbench, WorkbenchCatalogEntry } from "./workbench";

/** Obsidian view type of the workbench home. */
export const VIEW_TYPE_WORKBENCH_HOME = "workbench-home";

const OPEN_HOME_COMMAND_ID = "open-workbench-home";
const HOME_ICON = "layout-grid";

export interface WorkbenchHomeOptions {
	plugin: Plugin;
	workbench: Workbench;
	readSettings(): FlashcardSettings;
}

/**
 * The workbench's own entry point: one ribbon and one command that open a view
 * listing every available feature.
 *
 * Each feature still opens in its own Obsidian tab, so a dictionary and a note, or
 * a translation and a card, can sit side by side. The home only makes the features
 * discoverable and gives a disabled feature a way back to its settings.
 */
export function attachWorkbenchHome(options: WorkbenchHomeOptions): void {
	const { plugin, workbench } = options;

	plugin.registerView(
		VIEW_TYPE_WORKBENCH_HOME,
		createReactItemView({
			type: VIEW_TYPE_WORKBENCH_HOME,
			icon: HOME_ICON,
			title: (language) => createSharedTranslator(language)("workbench.title"),
			readSettings: () => options.readSettings(),
			renderErrorMessage: (language) =>
				createSharedTranslator(language)("notice.viewRenderFailed"),
			render: ({ language }) => (
				<WorkbenchHome
					entries={workbench.catalog()}
					language={language}
					onOpen={(entry) => entry.open()}
					onOpenSettings={(entry) => workbench.settingsTab.open(entry.settingsSectionId)}
				/>
			),
		}),
	);

	// The ring is host chrome: the workbench rebuilds it on every refresh, so the
	// ribbon label follows the interface language with everything else.
	workbench.ring((chrome) => {
		const t = createSharedTranslator(options.readSettings().language);
		const title = t("workbench.title");
		chrome.ribbon(HOME_ICON, title, () => {
			void activateHome(options);
		});
		chrome.command({
			id: OPEN_HOME_COMMAND_ID,
			name: title,
			run: () => {
				void activateHome(options);
			},
		});
	});
}

async function activateHome(options: WorkbenchHomeOptions): Promise<void> {
	const workspace = options.plugin.app.workspace;
	let leaf = workspace.getLeavesOfType(VIEW_TYPE_WORKBENCH_HOME)[0];
	if (!leaf) {
		leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_WORKBENCH_HOME, active: true });
	}
	await workspace.revealLeaf(leaf);
}

export const WorkbenchHome: React.FC<{
	entries: WorkbenchCatalogEntry[];
	language: Language;
	onOpen: (entry: WorkbenchCatalogEntry) => void;
	onOpenSettings: (entry: WorkbenchCatalogEntry) => void;
}> = ({ entries, language, onOpen, onOpenSettings }) => {
	const t = createSharedTranslator(language);
	return (
		<div className="flashcard-workbench-home">
			<h1 className="flashcard-workbench-home__title">{t("workbench.title")}</h1>
			<p className="flashcard-workbench-home__subtitle">{t("workbench.subtitle")}</p>
			<ul className="flashcard-workbench-home__list">
				{entries.map((entry) => {
					const available = entry.available();
					return (
						<li key={entry.id} className="flashcard-workbench-home__item">
							<button
								type="button"
								className="flashcard-workbench-home__entry"
								disabled={!available}
								onClick={() => onOpen(entry)}
							>
								<span className="flashcard-workbench-home__label">
									{entry.title(language)}
								</span>
								{!available && (
									<span className="flashcard-workbench-home__badge">
										{t("workbench.unavailable")}
									</span>
								)}
							</button>
							{!available && (
								<FlashcardButton
									variant="primary"
									onClick={() => onOpenSettings(entry)}
								>
									{t("workbench.openSettings")}
								</FlashcardButton>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
};
