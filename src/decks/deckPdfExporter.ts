import { Component, MarkdownRenderer, type App } from "obsidian";
import type { Deck } from "../shared/types";
import { ensurePdfExtension, getDeckPdfFileStem, getDeckPdfRows } from "./deckPdfViewModel";

export interface DeckPdfExportLabels {
	frontColumn: string;
	backColumn: string;
	cardCount: (count: number) => string;
	saveDialogTitle: string;
}

export interface DeckPdfExportProgress {
	phase: "rendering" | "generating";
	completed: number;
	total: number;
}

export interface DeckPdfExportOptions {
	onProgress?: (progress: DeckPdfExportProgress) => void;
}

const DECK_PDF_RENDER_BATCH_SIZE = 12;

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
			line-height: 1.4 !important;
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
			padding: 2.2mm 3mm;
			background: #e2e8f0;
			color: #0f172a;
			font-size: 10pt;
			font-weight: 700;
			text-align: left;
		}

		.flashcard-pdf-table td {
			padding: 1.8mm 3mm;
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
			margin-bottom: 0.35em;
		}

		.flashcard-pdf-content h1,
		.flashcard-pdf-content h2,
		.flashcard-pdf-content h3,
		.flashcard-pdf-content h4,
		.flashcard-pdf-content h5,
		.flashcard-pdf-content h6 {
			margin: 0 0 0.3em;
			color: #0f172a;
			font-size: 1em;
			line-height: 1.3;
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
	options: DeckPdfExportOptions = {},
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
	const printableDeck = createPrintableDeck(sourceDocument, deck, labels);
	let pdfWindow: ElectronBrowserWindow | null = null;
	let temporaryDirectory: string | null = null;

	try {
		component.load();
		options.onProgress?.({
			phase: "rendering",
			completed: 0,
			total: deck.cards.length,
		});
		await yieldToUi(sourceDocument.defaultView);
		await renderDeckRows(
			app,
			deck,
			printableDeck.tableBody,
			component,
			sourceDocument.defaultView,
			options.onProgress,
		);

		options.onProgress?.({
			phase: "generating",
			completed: deck.cards.length,
			total: deck.cards.length,
		});
		await yieldToUi(sourceDocument.defaultView);

		temporaryDirectory = await desktopRuntime.createTemporaryDirectory();
		const htmlFilePath = desktopRuntime.joinPath(temporaryDirectory, "deck.html");
		await desktopRuntime.writeFile(
			htmlFilePath,
			createPdfDocumentHtml(deck.name, sourceDocument.baseURI, printableDeck.root.outerHTML),
		);

		pdfWindow = desktopRuntime.createBackgroundWindow();
		pdfWindow.webContents.setBackgroundThrottling(false);
		await pdfWindow.loadFile(htmlFilePath);
		await waitForPrintAssets(pdfWindow);
		const pdfData = await pdfWindow.webContents.printToPDF({
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
		component.unload();
		printableDeck.root.remove();
		if (pdfWindow && !pdfWindow.isDestroyed()) {
			pdfWindow.destroy();
		}
		if (temporaryDirectory) {
			await desktopRuntime
				.removeTemporaryDirectory(temporaryDirectory)
				.catch(() => undefined);
		}
	}
}

interface PrintableDeck {
	root: HTMLElement;
	tableBody: HTMLTableSectionElement;
}

function createPrintableDeck(
	document: Document,
	deck: Deck,
	labels: DeckPdfExportLabels,
): PrintableDeck {
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
	table.appendChild(tableBody);
	root.appendChild(table);

	return { root, tableBody };
}

async function renderDeckRows(
	app: App,
	deck: Deck,
	tableBody: HTMLTableSectionElement,
	component: Component,
	sourceWindow: Window | null,
	onProgress: DeckPdfExportOptions["onProgress"],
): Promise<void> {
	const rows = getDeckPdfRows(deck);
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (!row) {
			throw new Error(`Card ${index + 1} could not be rendered`);
		}

		const rowElement = tableBody.ownerDocument.createElement("tr");
		const front = appendPrintableCell(rowElement);
		const back = appendPrintableCell(rowElement);
		tableBody.appendChild(rowElement);
		await MarkdownRenderer.render(app, row.front, front, deck.filePath, component);
		await MarkdownRenderer.render(app, row.back, back, deck.filePath, component);

		const completed = index + 1;
		if (completed % DECK_PDF_RENDER_BATCH_SIZE === 0 || completed === rows.length) {
			onProgress?.({
				phase: "rendering",
				completed,
				total: rows.length,
			});
			await yieldToUi(sourceWindow);
		}
	}
}

function appendPrintableCell(row: HTMLTableRowElement): HTMLElement {
	const cell = row.ownerDocument.createElement("td");
	const content = row.ownerDocument.createElement("div");
	content.className = "flashcard-pdf-content";
	cell.appendChild(content);
	row.appendChild(cell);
	return content;
}

function createPdfDocumentHtml(title: string, baseUri: string, content: string): string {
	return `<!doctype html>
<html lang="zh-CN">
	<head>
		<meta charset="utf-8">
		<meta name="color-scheme" content="light">
		<base href="${escapeHtml(baseUri)}">
		<title>${escapeHtml(title)}</title>
		<style>${DECK_PDF_PRINT_STYLES}</style>
	</head>
	<body class="flashcard-pdf-exporting">${content}</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

async function yieldToUi(sourceWindow: Window | null): Promise<void> {
	if (!sourceWindow) {
		await Promise.resolve();
		return;
	}
	await new Promise<void>((resolve) => {
		sourceWindow.setTimeout(resolve, 0);
	});
}

async function waitForPrintAssets(browserWindow: ElectronBrowserWindow): Promise<void> {
	await browserWindow.webContents.executeJavaScript(
		`(async () => {
			const pendingImages = Array.from(document.images).filter((image) => !image.complete);
			await Promise.race([
				Promise.all(
					pendingImages.map(
						(image) =>
							new Promise((resolve) => {
								image.addEventListener("load", resolve, { once: true });
								image.addEventListener("error", resolve, { once: true });
							}),
					),
				),
				new Promise((resolve) => setTimeout(resolve, 5000)),
			]);
			await document.fonts?.ready;
			await new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
		})()`,
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
	setBackgroundThrottling(allowed: boolean): void;
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
	loadFile(filePath: string): Promise<void>;
	isDestroyed(): boolean;
	destroy(): void;
}

interface ElectronBrowserWindowConstructor {
	new (options: {
		show: boolean;
		width: number;
		height: number;
		backgroundColor: string;
		webPreferences: {
			backgroundThrottling: boolean;
		};
	}): ElectronBrowserWindow;
}

interface ObsidianDesktopWindow extends Window {
	electron?: {
		remote?: {
			BrowserWindow?: ElectronBrowserWindowConstructor;
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
	createBackgroundWindow: () => ElectronBrowserWindow;
	createTemporaryDirectory: () => Promise<string>;
	joinPath: (...parts: string[]) => string;
	removeTemporaryDirectory: (path: string) => Promise<void>;
	writeFile: (filePath: string, data: string | Uint8Array) => Promise<void>;
}

function getDesktopPdfRuntime(document: Document): DesktopPdfRuntime {
	const desktopWindow = document.defaultView as ObsidianDesktopWindow | null;
	const remote = desktopWindow?.electron?.remote;
	const browserWindow = desktopWindow?.electronWindow ?? remote?.getCurrentWindow?.();
	const dialog = remote?.dialog;
	const BrowserWindow = remote?.BrowserWindow;
	const requireModule = desktopWindow?.require;
	if (!browserWindow || !dialog || !BrowserWindow || !requireModule) {
		throw new Error("The Obsidian desktop PDF runtime is unavailable");
	}

	const fileSystem = requireModule("node:fs/promises") as {
		mkdtemp: (prefix: string) => Promise<string>;
		rm: (path: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
		writeFile: (filePath: string, data: string | Uint8Array) => Promise<void>;
	};
	const path = requireModule("node:path") as {
		join: (...parts: string[]) => string;
	};
	const operatingSystem = requireModule("node:os") as {
		tmpdir: () => string;
	};
	return {
		browserWindow,
		dialog,
		createBackgroundWindow: () =>
			new BrowserWindow({
				show: false,
				width: 794,
				height: 1123,
				backgroundColor: "#ffffff",
				webPreferences: {
					backgroundThrottling: false,
				},
			}),
		createTemporaryDirectory: () =>
			fileSystem.mkdtemp(path.join(operatingSystem.tmpdir(), "wsr-flash-card-pdf-")),
		joinPath: path.join,
		removeTemporaryDirectory: (temporaryPath) =>
			fileSystem.rm(temporaryPath, { recursive: true, force: true }),
		writeFile: fileSystem.writeFile,
	};
}
