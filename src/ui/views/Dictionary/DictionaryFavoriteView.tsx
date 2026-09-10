import React, { useCallback, useSyncExternalStore } from "react";
import { Eraser, Save } from "lucide-react";
import type { DictionaryFavoriteController } from "../../../dictionary/favorite-controller";
import { dictionaryStrings } from "../../../i18n/dictionary";
import type { Language } from "../../../shared/types";
import { FlashcardButton } from "../../primitives/Button";
import { FlashcardInput, FlashcardTextarea } from "../../primitives/Input";

export interface DictionaryFavoriteViewProps {
	controller: DictionaryFavoriteController;
	language: Language;
}

export function DictionaryFavoriteView({
	controller,
	language,
}: DictionaryFavoriteViewProps): React.ReactElement {
	const subscribe = useCallback(
		(listener: () => void) => controller.subscribe(listener),
		[controller],
	);
	const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
	const state = useSyncExternalStore(subscribe, getSnapshot);
	const strings = dictionaryStrings(language);
	const saving = state.status === "saving";
	const canSave = Boolean(state.word.trim() && state.path.trim()) && !saving;

	return (
		<main className="flashcard-dictionary-favorite" aria-busy={saving}>
			<header className="flashcard-dictionary-favorite-header">
				<p className="fc-kicker">{strings.favoriteSidebarEyebrow}</p>
				<h2>{strings.favoriteSidebarTitle}</h2>
			</header>

			<p className="flashcard-dictionary-favorite-destination">
				<span>{strings.favoritePath}</span>
				<FlashcardButton
					type="button"
					variant="ghost"
					size="sm"
					title={state.savedPath}
					onClick={() => void controller.openSavedFile()}
				>
					{state.savedPath}
				</FlashcardButton>
			</p>

			<form
				className="flashcard-dictionary-favorite-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (canSave) void controller.save();
				}}
			>
				<label htmlFor="dictionary-favorite-word">
					<span>{strings.favoriteWord}</span>
					<FlashcardInput
						id="dictionary-favorite-word"
						value={state.word}
						placeholder={strings.favoriteWordPlaceholder}
						maxLength={128}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => controller.setWord(event.target.value)}
					/>
				</label>

				<label htmlFor="dictionary-favorite-path">
					<span>{strings.favoritePath}</span>
					<FlashcardInput
						id="dictionary-favorite-path"
						value={state.path}
						list="dictionary-favorite-path-suggestions"
						placeholder={strings.favoritePathPlaceholder}
						maxLength={500}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => controller.setPath(event.target.value)}
					/>
				</label>
				<datalist id="dictionary-favorite-path-suggestions">
					{state.pathSuggestions.map((path) => (
						<option key={path} value={path}>
							{path}
						</option>
					))}
				</datalist>

				<label htmlFor="dictionary-favorite-meaning">
					<span>{strings.favoriteMeaning}</span>
					<FlashcardTextarea
						id="dictionary-favorite-meaning"
						value={state.meaning}
						placeholder={strings.favoriteMeaningPlaceholder}
						maxLength={8000}
						rows={3}
						onChange={(event) => controller.setMeaning(event.target.value)}
					/>
				</label>

				<label htmlFor="dictionary-favorite-note">
					<span>{strings.favoriteNote}</span>
					<FlashcardTextarea
						id="dictionary-favorite-note"
						value={state.note}
						placeholder={strings.favoriteNotePlaceholder}
						maxLength={16000}
						rows={5}
						onChange={(event) => controller.setNote(event.target.value)}
					/>
				</label>

				<div className="flashcard-dictionary-favorite-actions">
					<FlashcardButton
						type="submit"
						variant="primary"
						icon={Save}
						disabled={!canSave}
					>
						{saving ? strings.favoriteSaving : strings.favoriteSave}
					</FlashcardButton>
					<FlashcardButton
						icon={Eraser}
						disabled={saving}
						onClick={() => controller.clear()}
					>
						{strings.favoriteClear}
					</FlashcardButton>
				</div>

				<output
					className={`flashcard-dictionary-favorite-message${state.status === "error" ? " is-error" : ""}`}
					aria-live="polite"
				>
					{state.message}
				</output>
			</form>
		</main>
	);
}
