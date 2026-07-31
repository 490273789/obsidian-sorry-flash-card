import React, { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { Notice } from "obsidian";
import type { PronunciationFailureReason, PronunciationRuntime } from "../../pronunciation";
import { normalizePronunciationText } from "../../pronunciation";
import { useI18n } from "./I18nContext";

interface PronunciationButtonProps {
	text: string;
}

interface PronunciationButtonRuntimeProps extends PronunciationButtonProps {
	runtime: PronunciationRuntime;
}

export const PronunciationButton: React.FC<PronunciationButtonRuntimeProps> = ({
	text,
	runtime,
}) => {
	const { t } = useI18n();
	const [availability, setAvailability] = useState({
		text: "",
		available: false,
	});
	const [revision, setRevision] = useState(0);
	const normalizedText = normalizePronunciationText(text);
	const snapshot = runtime.getSnapshot();

	useEffect(
		() =>
			runtime.subscribe(() => {
				setRevision((revision) => revision + 1);
			}),
		[runtime],
	);

	useEffect(() => {
		let active = true;
		void runtime
			.canSpeak(normalizedText)
			.then((canSpeak) => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: canSpeak,
					});
				}
			})
			.catch(() => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: false,
					});
				}
			});
		return () => {
			active = false;
		};
	}, [normalizedText, revision, runtime]);

	if (availability.text !== normalizedText || !availability.available) return null;

	const isSpeaking = snapshot.speakingText === normalizedText;
	const label = t("pronunciation.play", { word: normalizedText });

	return (
		<button
			type="button"
			className={`flashcard-pronunciation-button ${isSpeaking ? "is-speaking" : ""}`}
			aria-label={label}
			title={label}
			aria-pressed={isSpeaking}
			onClick={() => {
				void runtime
					.speak(normalizedText, "manual")
					.then((outcome) => {
						if (outcome.status === "failed" || outcome.status === "unavailable") {
							new Notice(getFailureMessage(outcome.reason, t));
						}
					})
					.catch(() => new Notice(t("pronunciation.failed")));
			}}
		>
			<Volume2 size={16} aria-hidden="true" />
		</button>
	);
};

function getFailureMessage(
	reason: PronunciationFailureReason,
	t: ReturnType<typeof useI18n>["t"],
): string {
	switch (reason) {
		case "offline":
			return t("pronunciation.offline");
		case "not-configured":
			return t("pronunciation.notConfigured");
		case "unauthorized":
			return t("pronunciation.unauthorized");
		case "quota":
			return t("pronunciation.quota");
		default:
			return t("pronunciation.failed");
	}
}
