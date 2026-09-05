import { TFile, type App } from "obsidian";
import type {
	ContinuitySourceDocument,
	ContinuitySourceStore,
} from "../identity/cardIdentityContinuity";

const LIST_CONCURRENCY = 16;

function normalizeTag(tag: string): string {
	return tag.startsWith("#") ? tag : `#${tag}`;
}

export function createObsidianContinuitySourceStore(app: App): ContinuitySourceStore {
	return new ObsidianContinuitySourceStore(app);
}

class ObsidianContinuitySourceStore implements ContinuitySourceStore {
	constructor(private readonly app: App) {}

	async list(configuredTags?: string[]): Promise<ContinuitySourceDocument[]> {
		const files = this.app.vault.getMarkdownFiles();
		if (files.length === 0) return [];

		const configuredLower = new Set(
			(configuredTags ?? []).map((tag) => normalizeTag(tag).toLowerCase()),
		);
		const metadataCache = this.app.metadataCache;
		// When no tags are configured (or metadata cache is unavailable) we must
		// keep reading everything so the sync can still discover available tags.
		const canPreFilter = configuredLower.size > 0 && Boolean(metadataCache);

		const candidates: Array<{ file: TFile; discoveryOnly: boolean }> = [];
		for (const file of files) {
			if (!canPreFilter) {
				candidates.push({ file, discoveryOnly: false });
				continue;
			}
			const cache = metadataCache!.getFileCache(file);
			// Missing metadata keeps the file on the authoritative read path.
			// Files indexed with no tags are skipped: they cannot match configured tags
			// nor contribute unconfigured tags for discovery.
			if (!cache) {
				candidates.push({ file, discoveryOnly: false });
				continue;
			}
			if (!cache.tags || cache.tags.length === 0) {
				continue;
			}
			const hasConfiguredTag = cache.tags.some((entry) =>
				configuredLower.has(normalizeTag(entry.tag).toLowerCase()),
			);
			candidates.push({ file, discoveryOnly: !hasConfiguredTag });
		}

		const documents: ContinuitySourceDocument[] = [];
		documents.length = candidates.length;
		let nextIndex = 0;
		const worker = async (): Promise<void> => {
			while (nextIndex < candidates.length) {
				const index = nextIndex++;
				const { file, discoveryOnly } = candidates[index]!;
				// Deliberately uncached read: migration previews must match the
				// content that replaceIfUnchanged() will compare against, which is
				// the live file content read by vault.process(). Unrelated tagged
				// files use cachedRead only for flashcard-tag discovery.
				documents[index] = {
					path: file.path,
					basename: file.basename,
					content: discoveryOnly
						? await this.app.vault.cachedRead(file)
						: await this.app.vault.read(file),
					...(discoveryOnly ? { discoveryOnly: true } : {}),
				};
			}
		};
		const workers = Array.from({ length: Math.min(LIST_CONCURRENCY, candidates.length) }, () =>
			worker(),
		);
		await Promise.all(workers);
		return documents;
	}

	async replaceIfUnchanged(
		path: string,
		expectedContent: string,
		nextContent: string,
	): Promise<"written" | "stale"> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return "stale";
		let written = false;
		await this.app.vault.process(file, (currentContent) => {
			if (currentContent !== expectedContent) return currentContent;
			written = true;
			return nextContent;
		});
		return written ? "written" : "stale";
	}
}
