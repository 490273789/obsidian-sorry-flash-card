import React from "react";
import type { PronunciationRuntime } from "../../../pronunciation";
import { MarkdownContent } from "./MarkdownContent";
import { PronunciationButton } from "../PronunciationButton";

export interface PronounceableMarkdownProps {
	content: string;
	word: string | null;
	runtime: PronunciationRuntime;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const PronounceableMarkdown: React.FC<PronounceableMarkdownProps> = ({
	content,
	word,
	runtime,
	markdownRenderer,
}) => (
	<div className="flashcard-pronunciation-row">
		<MarkdownContent
			content={content}
			className="flashcard-markdown"
			markdownRenderer={markdownRenderer}
		/>
		{word && <PronunciationButton text={word} runtime={runtime} />}
	</div>
);
