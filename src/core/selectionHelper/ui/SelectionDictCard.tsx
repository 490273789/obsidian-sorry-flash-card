import React, { useEffect } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { cls } from "../../shared/classNames";
import type { SelectionLookupSection, SelectionLookupSnapshot } from "../domain/types";
import type { SelectionHelperStrings } from "../strings/selectionPopup";
import styles from "./SelectionPopup.module.scss";

export interface SelectionDictCardProps {
	query: string;
	lookup: SelectionLookupSnapshot;
	strings: SelectionHelperStrings;
	onSelectSource: (sourceId: string) => void;
	onRetry: (sourceId: string) => void;
	onGenerateAi: () => void;
	onOpenInMainTab: (word: string) => void;
	onClose: () => void;
}

function renderSection(section: SelectionLookupSection): React.ReactNode {
	if (section.kind === "list") {
		return (
			<ol className={styles.list}>
				{section.items.map((item, index) => (
					<li key={`${index}-${item}`}>{item}</li>
				))}
			</ol>
		);
	}

	return (
		<div>
			{section.definitions.map((def, index) => (
				<div key={`${index}-${def.partOfSpeech}`} className={styles.aiSense}>
					{def.partOfSpeech && (
						<span className={styles.sensePos}>{def.partOfSpeech}</span>
					)}
					<span className={styles.senseMeaning}>{def.meaning}</span>
				</div>
			))}
		</div>
	);
}

export const SelectionDictCard = React.memo(function SelectionDictCard({
	query,
	lookup,
	strings,
	onSelectSource,
	onRetry,
	onGenerateAi,
	onOpenInMainTab,
	onClose,
}: SelectionDictCardProps) {
	const activeWord = lookup.query || query;
	const sources = lookup.sources;
	const activeSource =
		sources.find((source) => source.id === lookup.activeSourceId) ?? sources[0];

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

	const pronunciations = activeSource?.pronunciations ?? [];
	const sections = activeSource?.sections ?? [];

	return (
		<dialog open className={styles.card} aria-label={activeWord} tabIndex={-1}>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<h3 className={styles.word}>{activeWord}</h3>
					<kbd className={styles.kbd}>↵ Enter</kbd>
				</div>
				{pronunciations.length > 0 && (
					<div className={styles.phonetics}>
						{pronunciations.map((p, idx) => (
							<span key={`${idx}-${p.label}-${p.phonetic}`}>
								{p.label ? `[${p.label}] ` : ""}
								{p.phonetic ? `/${p.phonetic}/` : ""}
							</span>
						))}
					</div>
				)}
				{sources.length > 1 && (
					<div className={styles.tabs} role="tablist">
						{sources.map((source) => {
							const isActive = source.id === (activeSource?.id ?? "");
							return (
								<button
									key={source.id}
									type="button"
									role="tab"
									aria-selected={isActive}
									className={cls(styles.tab, isActive && styles.tabActive)}
									onClick={() => onSelectSource(source.id)}
								>
									{source.label}
								</button>
							);
						})}
					</div>
				)}
			</header>

			<main className={styles.body}>
				{activeSource?.kind === "ai" && activeSource.status === "idle" ? (
					<div className={styles.aiAction}>
						<button
							type="button"
							className={styles.aiGenerateBtn}
							onClick={onGenerateAi}
						>
							<Sparkles size={14} aria-hidden="true" />
							<span>{strings.aiGenerate}</span>
						</button>
						{lookup.aiEngineName && (
							<span className={styles.aiEngineHint}>{lookup.aiEngineName}</span>
						)}
					</div>
				) : activeSource?.status === "loading" ? (
					<div className={styles.status}>
						{activeSource.kind === "ai" ? strings.aiGenerating : strings.loading}
					</div>
				) : activeSource?.status === "empty" ? (
					<div className={styles.status}>{strings.emptyDefinition}</div>
				) : activeSource?.status === "error" ? (
					<div className={cls(styles.status, styles.statusError)}>
						<p>{activeSource.error || strings.emptyDefinition}</p>
						<button
							type="button"
							className={styles.aiGenerateBtn}
							onClick={() =>
								activeSource.kind === "ai"
									? onGenerateAi()
									: onRetry(activeSource.id)
							}
						>
							<RotateCcw size={14} aria-hidden="true" />
							<span>{strings.retry}</span>
						</button>
					</div>
				) : sections.length > 0 ? (
					<>
						{sections.map((section, idx) => (
							<div key={idx}>{renderSection(section)}</div>
						))}
						{activeSource?.hasComplexContent && (
							<div className={styles.status}>{strings.complexContent}</div>
						)}
					</>
				) : activeSource?.hasComplexContent ? (
					<div className={styles.status}>{strings.complexContent}</div>
				) : lookup.status === "loading" ? (
					<div className={styles.status}>{strings.loading}</div>
				) : (
					<div className={styles.status}>{strings.emptyDefinition}</div>
				)}
			</main>

			<footer className={styles.footer}>
				<span>{strings.openInMainTabHint}</span>
				<kbd className={styles.kbd}>Esc 关闭</kbd>
			</footer>
		</dialog>
	);
});
