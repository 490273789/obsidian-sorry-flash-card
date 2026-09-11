import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import type { DictionaryController } from "../../dictionary/domain/controller";
import type { DictionarySectionContent } from "../../dictionary/domain/types";
import type { SelectionPopupStrings } from "../strings/selectionPopup";

export interface SelectionDictCardProps {
	query: string;
	controller: DictionaryController;
	selectedDictionaries?: readonly string[];
	strings: SelectionPopupStrings;
	onOpenInMainTab: (word: string) => void;
	onClose: () => void;
}

function renderSection(content: DictionarySectionContent, word: string): React.ReactNode {
	if (content.kind === "list") {
		return (
			<ol className="fc-selection-card__list">
				{content.items.map((item, index) => (
					<li key={`${index}-${item}`}>{item}</li>
				))}
			</ol>
		);
	}

	if (content.kind === "ai-definitions") {
		return (
			<div className="fc-selection-card__ai-senses">
				{content.definitions.map((def, index) => (
					<div
						key={`${index}-${def.partOfSpeech}`}
						className="fc-selection-card__ai-sense"
					>
						{def.partOfSpeech && (
							<span className="fc-sense-pos">{def.partOfSpeech}</span>
						)}
						<span className="fc-sense-meaning">{def.meaning}</span>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="fc-selection-card__sandbox-hint">
			<p>{word}</p>
		</div>
	);
}

export const SelectionDictCard = React.memo(function SelectionDictCard({
	query,
	controller,
	selectedDictionaries,
	strings,
	onOpenInMainTab,
	onClose,
}: SelectionDictCardProps) {
	const subscribe = useCallback(
		(listener: () => void) => controller.subscribe(listener),
		[controller],
	);
	const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const activeWord = state.query || query;
	const sources = useMemo(() => {
		if (!selectedDictionaries || selectedDictionaries.length === 0) {
			return state.sources;
		}
		const allowed = new Set(selectedDictionaries);
		const filtered = state.sources.filter((s) => allowed.has(s.id));
		return filtered.length > 0 ? filtered : state.sources;
	}, [state.sources, selectedDictionaries]);

	const activeSource = sources.find((s) => s.id === state.activeSourceId) ?? sources[0];

	const handleGenerateAi = useCallback(async () => {
		if (!state.query && query) {
			controller.prefill(query);
			await controller.lookup();
		}
		await controller.loadAi();
	}, [controller, state.query, query]);

	const handleRetry = useCallback(
		async (sourceId: string, kind?: string) => {
			if (kind === "ai") {
				await handleGenerateAi();
			} else {
				await controller.retry(sourceId);
			}
		},
		[controller, handleGenerateAi],
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}

			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				onOpenInMainTab(activeWord);
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [activeWord, onOpenInMainTab, onClose]);

	const pronunciations = activeSource?.result?.pronunciations ?? [];
	const sections = activeSource?.result?.sections ?? [];

	return (
		<div
			className="fc-selection-card"
			role="dialog"
			aria-label={activeWord}
			tabIndex={-1}
			onClick={(e) => e.stopPropagation()}
		>
			<header className="fc-selection-card__header">
				<div className="fc-selection-card__title-row">
					<h3 className="fc-selection-card__word">{activeWord}</h3>
					<kbd className="fc-selection-card__kbd">↵ Enter</kbd>
				</div>
				{pronunciations.length > 0 && (
					<div className="fc-selection-card__phonetics">
						{pronunciations.map((p, idx) => (
							<span key={`${idx}-${p.label}-${p.phonetic}`}>
								{p.label ? `[${p.label}] ` : ""}
								{p.phonetic ? `/${p.phonetic}/` : ""}
							</span>
						))}
					</div>
				)}
				{sources.length > 1 && (
					<div className="fc-selection-card__tabs" role="tablist">
						{sources.map((source) => {
							const isActive = source.id === (activeSource?.id ?? "");
							return (
								<button
									key={source.id}
									type="button"
									role="tab"
									aria-selected={isActive}
									className={`fc-selection-card__tab ${isActive ? "fc-selection-card__tab--active" : ""}`}
									onClick={() => controller.selectSource(source.id)}
								>
									{source.label}
								</button>
							);
						})}
					</div>
				)}
			</header>

			<main className="fc-selection-card__body">
				{activeSource?.kind === "ai" && activeSource.status === "idle" ? (
					<div className="fc-selection-card__ai-action">
						<button
							type="button"
							className="fc-selection-card__ai-generate-btn"
							onClick={() => void handleGenerateAi()}
						>
							<Sparkles size={14} aria-hidden="true" />
							<span>{strings.aiGenerate}</span>
						</button>
						{state.aiEngineName && (
							<span className="fc-selection-card__ai-engine-hint">
								{state.aiEngineName}
							</span>
						)}
					</div>
				) : activeSource?.status === "loading" ? (
					<div className="fc-selection-card__status">
						{activeSource.kind === "ai" ? strings.aiGenerating : strings.loading}
					</div>
				) : activeSource?.status === "empty" ? (
					<div className="fc-selection-card__status">{strings.emptyDefinition}</div>
				) : activeSource?.status === "error" ? (
					<div className="fc-selection-card__status fc-selection-card__status--error">
						<p>{activeSource.error || strings.emptyDefinition}</p>
						<button
							type="button"
							className="fc-selection-card__ai-generate-btn"
							onClick={() => void handleRetry(activeSource.id, activeSource.kind)}
						>
							<RotateCcw size={14} aria-hidden="true" />
							<span>{strings.retry}</span>
						</button>
					</div>
				) : sections.length > 0 ? (
					sections.map((section, idx) => (
						<div key={`${idx}-${section.title}`} className="fc-selection-card__section">
							{renderSection(section.content, activeWord)}
						</div>
					))
				) : state.status === "loading" ? (
					<div className="fc-selection-card__status">{strings.loading}</div>
				) : (
					<div className="fc-selection-card__status">{strings.emptyDefinition}</div>
				)}
			</main>

			<footer className="fc-selection-card__footer">
				<span>{strings.openInMainTabHint}</span>
				<kbd className="fc-selection-card__kbd">Esc 关闭</kbd>
			</footer>
		</div>
	);
});
