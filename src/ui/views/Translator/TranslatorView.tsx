import React, { useCallback, useId, useState, useSyncExternalStore } from "react";
import { Copy, Languages, Settings2, Trash2 } from "lucide-react";
import { aiErrorText } from "../../../i18n/ai";
import { formatTranslationString, translationStrings } from "../../../i18n/translation";
import type { Language } from "../../../shared/types";
import type { TranslationRuntime } from "../../../translation/translationRuntime";
import type { TranslationResultState } from "../../../translation/types";
import { FlashcardButton } from "../../primitives/Button";
import { FlashcardHeader } from "../../primitives/Header";
import { FlashcardTextarea } from "../../primitives/Input";

interface TranslatorViewProps {
	runtime: TranslationRuntime;
	language: Language;
	onOpenSettings: () => void;
}

interface CopyFeedback {
	result: TranslationResultState;
	message: string;
	isError: boolean;
}

function resultUsage(result: TranslationResultState, usage: string): string | null {
	if (!result.usage) return null;
	return formatTranslationString(usage, {
		input: result.usage.inputTokens ?? "—",
		output: result.usage.outputTokens ?? "—",
	});
}

function providerLabel(provider: string, strings: ReturnType<typeof translationStrings>): string {
	if (provider === "deepseek") return strings.deepseek;
	if (provider === "bailian") return strings.bailian;
	if (provider === "youdao") return strings.youdao;
	return strings.unavailable;
}

export const TranslatorView = React.memo(function TranslatorView({
	runtime,
	language,
	onOpenSettings,
}: TranslatorViewProps) {
	const subscribe = useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
	const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot);
	const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
	const viewId = useId();
	const strings = translationStrings(language);
	const isLoading = snapshot.status === "loading";
	const configuredProfiles = snapshot.settings.profiles.filter((profile) => profile.enabled);
	const canTranslate =
		snapshot.settings.enabled &&
		configuredProfiles.length > 0 &&
		Boolean(snapshot.input.trim()) &&
		!isLoading &&
		!snapshot.saving;
	const canClear =
		Boolean(snapshot.input) ||
		snapshot.results.some((result) => Boolean(result.text || result.error)) ||
		isLoading;
	const sourceLanguage =
		snapshot.settings.direction === "zh-en" ? strings.chinese : strings.english;
	const targetLanguage =
		snapshot.settings.direction === "zh-en" ? strings.english : strings.chinese;
	const succeeded = snapshot.results.filter((result) => result.status === "success").length;
	const failed = snapshot.results.filter((result) => result.status === "error").length;
	const statusText = isLoading
		? formatTranslationString(strings.loadingProfiles, { count: configuredProfiles.length })
		: snapshot.status === "success" && failed > 0
			? formatTranslationString(strings.partialProfiles, {
					success: succeeded,
					total: snapshot.results.length,
					failed,
				})
			: snapshot.status === "success"
				? formatTranslationString(strings.completedProfiles, { count: succeeded })
				: snapshot.status === "error" && failed > 0
					? strings.failedProfiles
					: snapshot.error
						? aiErrorText(language, snapshot.error)
						: null;
	const isStatusError = snapshot.status === "error";

	const copyResult = async (result: TranslationResultState): Promise<void> => {
		try {
			if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
			await navigator.clipboard.writeText(result.text);
			setCopyFeedback({ result, message: strings.copied, isError: false });
		} catch {
			setCopyFeedback({ result, message: strings.copyFailed, isError: true });
		}
	};

	return (
		<main className="flashcard-translator" aria-busy={isLoading}>
			<FlashcardHeader
				icon={Languages}
				title={strings.title}
				badge={statusText ?? undefined}
				right={
					<>
						<span className="flashcard-translator-model-count">
							{formatTranslationString(strings.modelCount, {
								count: configuredProfiles.length,
							})}
						</span>
						<FlashcardButton
							preset="icon"
							icon={Settings2}
							title={strings.openSettings}
							aria-label={strings.openSettings}
							onClick={onOpenSettings}
						/>
					</>
				}
			/>

			<section className="flashcard-translator-direction" aria-label={strings.direction}>
				<strong>{sourceLanguage}</strong>
				<FlashcardButton
					preset="icon"
					variant="secondary"
					icon={Languages}
					title={strings.swapDirection}
					aria-label={strings.swapDirection}
					disabled={isLoading || snapshot.saving}
					onClick={() => void runtime.swapDirection()}
				/>
				<strong>{targetLanguage}</strong>
			</section>

			{!snapshot.settings.enabled ? (
				<section className="flashcard-translator-notice">
					<span>{strings.disabled}</span>
					<FlashcardButton variant="secondary" size="sm" onClick={onOpenSettings}>
						{strings.openSettings}
					</FlashcardButton>
				</section>
			) : configuredProfiles.length === 0 ? (
				<section className="flashcard-translator-notice">
					<span>{strings.noProfiles}</span>
					<FlashcardButton variant="secondary" size="sm" onClick={onOpenSettings}>
						{strings.openSettings}
					</FlashcardButton>
				</section>
			) : null}

			<section className="flashcard-translator-workspace">
				<article className="flashcard-translator-panel flashcard-translator-source">
					<header>
						<label htmlFor={`${viewId}-translator-input`}>{strings.inputLabel}</label>
						<span>
							{formatTranslationString(strings.characterCount, {
								count: snapshot.input.length,
							})}
						</span>
					</header>
					<FlashcardTextarea
						id={`${viewId}-translator-input`}
						value={snapshot.input}
						placeholder={strings.inputPlaceholder}
						disabled={isLoading || !snapshot.settings.enabled}
						spellCheck
						onChange={(event) => runtime.setInput(event.target.value)}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								(event.ctrlKey || event.metaKey) &&
								canTranslate
							) {
								event.preventDefault();
								void runtime.translate();
							}
						}}
					/>
				</article>

				<section className="flashcard-translator-results" aria-label={strings.outputLabel}>
					{snapshot.results.map((result) => {
						const usage = resultUsage(result, strings.usage);
						const feedback = copyFeedback?.result === result ? copyFeedback : null;
						const error = result.error ? aiErrorText(language, result.error) : null;
						return (
							<article
								key={result.id}
								className="flashcard-translator-panel flashcard-translator-result"
								aria-busy={result.status === "loading"}
							>
								<header>
									<div className="flashcard-translator-result-title">
										<strong>{result.name}</strong>
										<span>
											{result.model
												? `${providerLabel(result.provider, strings)} · ${result.model}`
												: providerLabel(result.provider, strings)}
										</span>
									</div>
									<FlashcardButton
										size="sm"
										icon={Copy}
										disabled={!result.text || result.status === "loading"}
										onClick={() => void copyResult(result)}
									>
										{strings.copy}
									</FlashcardButton>
								</header>
								<FlashcardTextarea
									id={`${viewId}-translator-output-${result.id}`}
									aria-label={formatTranslationString(strings.resultLabel, {
										name: result.name,
									})}
									value={result.text}
									placeholder={
										result.status === "loading"
											? strings.translating
											: strings.outputPlaceholder
									}
									readOnly
								/>
								{(error || usage || feedback) && (
									<footer>
										{error && (
											<p className="is-error" role="alert">
												{error}
											</p>
										)}
										{feedback && (
											<p
												className={feedback.isError ? "is-error" : ""}
												role={feedback.isError ? "alert" : "status"}
											>
												{feedback.message}
											</p>
										)}
										{usage && (
											<p className="flashcard-translator-usage">{usage}</p>
										)}
									</footer>
								)}
							</article>
						);
					})}
				</section>
			</section>

			<footer className="flashcard-translator-footer">
				<div className="flashcard-translator-actions">
					<FlashcardButton
						variant="primary"
						disabled={!canTranslate}
						onClick={() => void runtime.translate()}
					>
						{isLoading ? strings.translating : strings.translate}
					</FlashcardButton>
					<FlashcardButton
						icon={Trash2}
						disabled={!canClear}
						onClick={() => runtime.clear()}
					>
						{strings.clear}
					</FlashcardButton>
					<span>{strings.shortcutHint}</span>
				</div>
				{statusText && (
					<p
						className={`flashcard-translator-status ${isStatusError ? "is-error" : ""}`}
						role={isStatusError ? "alert" : "status"}
					>
						{statusText}
					</p>
				)}
			</footer>
		</main>
	);
});
