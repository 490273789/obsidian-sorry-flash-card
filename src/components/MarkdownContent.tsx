import React, { memo, useEffect, useRef } from "react";

interface MarkdownContentProps {
	content: string;
	className: string;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const MarkdownContent = memo(function MarkdownContent({
	content,
	className,
	markdownRenderer,
}: MarkdownContentProps) {
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;

		el.innerHTML = "";
		void markdownRenderer(content, el);
	}, [content, markdownRenderer]);

	return <div ref={contentRef} className={className} />;
});
