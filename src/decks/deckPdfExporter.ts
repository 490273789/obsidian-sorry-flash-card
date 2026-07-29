import { Component, MarkdownRenderer, type App } from "obsidian";
import type { Deck } from "../shared/types";
import { ensurePdfExtension, getDeckPdfFileStem, getDeckPdfRows } from "./deckPdfViewModel";

export interface DeckPdfExportLabels {
	frontColumn: string;
	backColumn: string;
	cardCount: (count: number) => string;
	saveDialogTitle: string;
}

export const DECK_PDF_PRINT_STYLES = `
	@page {
		size: A4 portrait;
		margin: 14mm 12mm 16mm;
	}

	@media print {
		html,
		body {
			margin: 0 !important;
			background: #ffffff !important;
			color: #1f2937 !important;
			font-family:
				-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
				"Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
				"Noto Sans SC", sans-serif !important;
			font-size: 10.5pt !important;
			line-height: 1.55 !important;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		body.flashcard-pdf-exporting > :not(.flashcard-pdf-document) {
			display: none !important;
		}

		body.flashcard-pdf-exporting > .flashcard-pdf-document {
			display: block !important;
			position: static !important;
			width: auto !important;
			height: auto !important;
			overflow: visible !important;
		}

		.flashcard-pdf-document,
		.flashcard-pdf-document * {
			box-sizing: border-box;
		}

		.flashcard-pdf-header {
			display: flex;
			align-items: flex-end;
			justify-content: space-between;
			gap: 16px;
			margin: 0 0 8mm;
			padding-bottom: 4mm;
			border-bottom: 2px solid #334155;
		}

		.flashcard-pdf-title {
			margin: 0;
			color: #0f172a;
			font-size: 19pt;
			font-weight: 700;
			line-height: 1.25;
			overflow-wrap: anywhere;
		}

		.flashcard-pdf-meta {
			flex: 0 0 auto;
			color: #64748b;
			font-size: 9pt;
			white-space: nowrap;
		}

		.flashcard-pdf-table {
			width: 100%;
			table-layout: fixed;
			border-collapse: collapse;
		}

		.flashcard-pdf-table thead {
			display: table-header-group;
		}

		.flashcard-pdf-table tr {
			break-inside: avoid;
			page-break-inside: avoid;
		}

		.flashcard-pdf-table th,
		.flashcard-pdf-table td {
			width: 50%;
			border: 0.7pt solid #94a3b8;
			vertical-align: top;
			overflow-wrap: anywhere;
			word-break: break-word;
		}

		.flashcard-pdf-table th {
			padding: 3mm 3.5mm;
			background: #e2e8f0;
			color: #0f172a;
			font-size: 10pt;
			font-weight: 700;
			text-align: left;
		}

		.flashcard-pdf-table td {
			padding: 3.2mm 3.5mm;
			background: #ffffff;
		}

		.flashcard-pdf-table tbody tr:nth-child(even) td {
			background: #f8fafc;
		}

		.flashcard-pdf-content > :first-child {
			margin-top: 0;
		}

		.flashcard-pdf-content > :last-child {
			margin-bottom: 0;
		}

		.flashcard-pdf-content p,
		.flashcard-pdf-content ul,
		.flashcard-pdf-content ol,
		.flashcard-pdf-content blockquote,
		.flashcard-pdf-content pre,
		.flashcard-pdf-content table {
			margin-top: 0;
			margin-bottom: 0.65em;
		}

		.flashcard-pdf-content h1,
		.flashcard-pdf-content h2,
		.flashcard-pdf-content h3,
		.flashcard-pdf-content h4,
		.flashcard-pdf-content h5,
		.flashcard-pdf-content h6 {
			margin: 0 0 0.45em;
			color: #0f172a;
			font-size: 1em;
			line-height: 1.4;
		}

		.flashcard-pdf-content img,
		.flashcard-pdf-content svg,
		.flashcard-pdf-content canvas {
			max-width: 100%;
			height: auto;
		}

		.flashcard-pdf-content pre,
		.flashcard-pdf-content code {
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
			font-size: 0.88em;
		}

		.flashcard-pdf-content blockquote {
			margin-left: 0;
			padding-left: 0.8em;
			border-left: 2px solid #cbd5e1;
			color: #475569;
		}

		.flashcard-pdf-content a {
			color: inherit;
			text-decoration: none;
		}
	}
`;

export type DeckPdfExportResult = { kind: "saved"; filePath: string } | { kind: "cancelled" };

export async function exportDeckToPdf(
	app: App,
	deck: Deck,
	labels: DeckPdfExportLabels,
): Promise<DeckPdfExportResult> {
	const sourceDocument = activeDocument;
	const desktopRuntime = getDesktopPdfRuntime(sourceDocument);
	const saveResult = await desktopRuntime.dialog.showSaveDialog(desktopRuntime.browserWindow, {
		title: labels.saveDialogTitle,
		defaultPath: `${getDeckPdfFileStem(deck.name)}.pdf`,
		filters: [{ name: "PDF", extensions: ["pdf"] }],
		properties: ["createDirectory", "showOverwriteConfirmation"],
	});
	if (saveResult.canceled || !saveResult.filePath) {
		return { kind: "cancelled" };
	}

	const component = new Component();
	const renderRoot = createPrintableDeck(sourceDocument, deck, labels);
	const printStyle = sourceDocument.createElement("style");
	printStyle.dataset.flashcardPdfExport = "true";
	printStyle.textContent = DECK_PDF_PRINT_STYLES;
	const originalDocumentTitle = sourceDocument.title;
	renderRoot.style.position = "fixed";
	renderRoot.style.left = "-100000px";
	renderRoot.style.top = "0";
	renderRoot.style.width = "210mm";
	sourceDocument.body.appendChild(renderRoot);
	sourceDocument.head.appendChild(printStyle);

	try {
		component.load();
		await renderDeckRows(app, deck, renderRoot, component);
		sourceDocument.body.classList.add("flashcard-pdf-exporting");
		sourceDocument.title = deck.name;
		await waitForPrintAssets(sourceDocument, renderRoot, desktopRuntime.browserWindow);
		const pdfData = await desktopRuntime.browserWindow.webContents.printToPDF({
			displayHeaderFooter: false,
			landscape: false,
			pageSize: "A4",
			preferCSSPageSize: true,
			printBackground: true,
		});
		const filePath = ensurePdfExtension(saveResult.filePath);
		await desktopRuntime.writeFile(filePath, pdfData);
		return { kind: "saved", filePath };
	} finally {
		sourceDocument.body.classList.remove("flashcard-pdf-exporting");
		sourceDocument.title = originalDocumentTitle;
		component.unload();
		renderRoot.remove();
		printStyle.remove();
	}
}

function createPrintableDeck(
	document: Document,
	deck: Deck,
	labels: DeckPdfExportLabels,
): HTMLElement {
	const root = document.createElement("main");
	root.className = "flashcard-pdf-document";

	const header = document.createElement("header");
	header.className = "flashcard-pdf-header";

	const title = document.createElement("h1");
	title.className = "flashcard-pdf-title";
	title.textContent = deck.name;
	header.appendChild(title);

	const meta = document.createElement("div");
	meta.className = "flashcard-pdf-meta";
	meta.textContent = labels.cardCount(deck.cards.length);
	header.appendChild(meta);
	root.appendChild(header);

	const table = document.createElement("table");
	table.className = "flashcard-pdf-table";

	const tableHead = document.createElement("thead");
	const headerRow = document.createElement("tr");
	for (const label of [labels.frontColumn, labels.backColumn]) {
		const headerCell = document.createElement("th");
		headerCell.scope = "col";
		headerCell.textContent = label;
		headerRow.appendChild(headerCell);
	}
	tableHead.appendChild(headerRow);
	table.appendChild(tableHead);

	const tableBody = document.createElement("tbody");
	for (let index = 0; index < deck.cards.length; index += 1) {
		const row = document.createElement("tr");
		row.dataset.cardIndex = String(index);

		for (const side of ["front", "back"] as const) {
			const cell = document.createElement("td");
			const content = document.createElement("div");
			content.className = "flashcard-pdf-content";
			content.dataset.cardSide = side;
			cell.appendChild(content);
			row.appendChild(cell);
		}

		tableBody.appendChild(row);
	}
	table.appendChild(tableBody);
	root.appendChild(table);

	return root;
}

async function renderDeckRows(
	app: App,
	deck: Deck,
	renderRoot: HTMLElement,
	component: Component,
): Promise<void> {
	const rows = getDeckPdfRows(deck);
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		const front = renderRoot.querySelector<HTMLElement>(
			`[data-card-index="${index}"] [data-card-side="front"]`,
		);
		const back = renderRoot.querySelector<HTMLElement>(
			`[data-card-index="${index}"] [data-card-side="back"]`,
		);
		if (!row || !front || !back) {
			throw new Error(`Card ${index + 1} could not be rendered`);
		}

		await MarkdownRenderer.render(app, row.front, front, deck.filePath, component);
		await MarkdownRenderer.render(app, row.back, back, deck.filePath, component);
	}
}

async function waitForPrintAssets(
	document: Document,
	renderRoot: HTMLElement,
	browserWindow: ElectronBrowserWindow,
): Promise<void> {
	const sourceWindow = document.defaultView;
	if (!sourceWindow) return;
	const pendingImages = Array.from(renderRoot.querySelectorAll("img")).filter(
		(image) => !image.complete,
	);
	const imageReady = Promise.all(
		pendingImages.map(
			(image) =>
				new Promise<void>((resolve) => {
					image.addEventListener("load", () => resolve(), { once: true });
					image.addEventListener("error", () => resolve(), { once: true });
				}),
		),
	);
	const timeout = new Promise<void>((resolve) => {
		sourceWindow.setTimeout(resolve, 5_000);
	});

	await Promise.race([imageReady.then(() => undefined), timeout]);
	await document.fonts?.ready;
	await browserWindow.webContents.executeJavaScript(
		"new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
	);
}

interface ElectronSaveDialogResult {
	canceled: boolean;
	filePath?: string;
}

interface ElectronDialog {
	showSaveDialog(
		browserWindow: ElectronBrowserWindow,
		options: {
			title: string;
			defaultPath: string;
			filters: Array<{ name: string; extensions: string[] }>;
			properties: string[];
		},
	): Promise<ElectronSaveDialogResult>;
}

interface ElectronWebContents {
	executeJavaScript(code: string): Promise<unknown>;
	printToPDF(options: {
		displayHeaderFooter: boolean;
		landscape: boolean;
		pageSize: "A4";
		preferCSSPageSize: boolean;
		printBackground: boolean;
	}): Promise<Uint8Array>;
}

interface ElectronBrowserWindow {
	webContents: ElectronWebContents;
}

interface ObsidianDesktopWindow extends Window {
	electron?: {
		remote?: {
			dialog?: ElectronDialog;
			getCurrentWindow?: () => ElectronBrowserWindow;
		};
	};
	electronWindow?: ElectronBrowserWindow;
	require?: (id: string) => unknown;
}

interface DesktopPdfRuntime {
	browserWindow: ElectronBrowserWindow;
	dialog: ElectronDialog;
	writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
}

function getDesktopPdfRuntime(document: Document): DesktopPdfRuntime {
	const desktopWindow = document.defaultView as ObsidianDesktopWindow | null;
	const remote = desktopWindow?.electron?.remote;
	const browserWindow = desktopWindow?.electronWindow ?? remote?.getCurrentWindow?.();
	const dialog = remote?.dialog;
	const requireModule = desktopWindow?.require;
	if (!browserWindow || !dialog || !requireModule) {
		throw new Error("The Obsidian desktop PDF runtime is unavailable");
	}

	const fileSystem = requireModule("node:fs/promises") as {
		writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
	};
	return {
		browserWindow,
		dialog,
		writeFile: fileSystem.writeFile,
	};
}
