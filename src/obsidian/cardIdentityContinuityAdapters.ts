import { TFile, type Vault } from "obsidian";
import type {
	ContinuitySourceDocument,
	ContinuitySourceStore,
} from "../identity/cardIdentityContinuity";

export function createObsidianContinuitySourceStore(vault: Vault): ContinuitySourceStore {
	return new ObsidianContinuitySourceStore(vault);
}

class ObsidianContinuitySourceStore implements ContinuitySourceStore {
	constructor(private readonly vault: Vault) {}

	async list(): Promise<ContinuitySourceDocument[]> {
		const documents: ContinuitySourceDocument[] = [];
		for (const file of this.vault.getMarkdownFiles()) {
			documents.push({
				path: file.path,
				basename: file.basename,
				content: await this.vault.cachedRead(file),
			});
		}
		return documents;
	}

	async replaceIfUnchanged(
		path: string,
		expectedContent: string,
		nextContent: string,
	): Promise<"written" | "stale"> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return "stale";
		let written = false;
		await this.vault.process(file, (currentContent) => {
			if (currentContent !== expectedContent) return currentContent;
			written = true;
			return nextContent;
		});
		return written ? "written" : "stale";
	}
}
