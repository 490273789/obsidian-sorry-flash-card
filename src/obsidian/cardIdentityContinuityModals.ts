import { App, Modal, Setting } from "obsidian";
import type { createTranslator } from "../i18n";
import type {
	CardIdentityIssue,
	ContinuityResolution,
	MigrationPreview,
} from "../identity/cardIdentityContinuity";

type Translator = ReturnType<typeof createTranslator>;

export class CardIdentityMigrationModal extends Modal {
	constructor(
		app: App,
		private readonly preview: MigrationPreview,
		private readonly t: Translator,
		private readonly onConfirm: (deckIds: string[]) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.t("identity.migrationTitle"));
		this.contentEl.createEl("p", {
			text: this.t("identity.migrationDescription", {
				sources: this.preview.sourceCount,
				cards: this.preview.cardCount,
			}),
		});
		const list = this.contentEl.createEl("ul");
		for (const source of this.preview.sources) {
			list.createEl("li", {
				text: `${source.deckName} · ${source.cardCount} ${this.t("common.cards")}`,
			});
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(this.t("common.cancel")).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(this.t("identity.migrateNow"))
					.onClick(() => {
						this.close();
						this.onConfirm(this.preview.sources.map((source) => source.deckId));
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class CardIdentityRepairModal extends Modal {
	private readonly assignments = new Map<string, string | null>();

	constructor(
		app: App,
		private readonly issue: CardIdentityIssue,
		private readonly t: Translator,
		private readonly onConfirm: (
			successors: Extract<ContinuityResolution, { kind: "repair" }>["successors"],
		) => void,
		private readonly onInvalid: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.t("identity.repairTitle"));
		this.contentEl.createEl("p", { text: this.t("identity.repairDescription") });
		const identities =
			this.issue.type === "identity-conflict"
				? [this.issue.identity]
				: this.issue.missingIdentities;
		for (const identity of identities) {
			this.assignments.set(identity, null);
			new Setting(this.contentEl)
				.setName(shortIdentity(identity))
				.setDesc(this.t("identity.chooseSuccessor"))
				.addDropdown((dropdown) => {
					dropdown.addOption("", this.t("identity.markDeleted"));
					for (const candidate of this.issue.candidates) {
						dropdown.addOption(
							candidate.token,
							`${candidate.sourcePath} · ${truncate(candidate.front, 28)}`,
						);
					}
					dropdown.onChange((token) => {
						this.assignments.set(identity, token || null);
					});
				});
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(this.t("common.cancel")).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(this.t("identity.applyRepair"))
					.onClick(() => this.submit()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const selected = Array.from(this.assignments.values()).filter(
			(token): token is string => token !== null,
		);
		if (new Set(selected).size !== selected.length) {
			this.onInvalid();
			return;
		}
		this.close();
		this.onConfirm(
			Array.from(this.assignments, ([cardIdentity, occurrence]) => ({
				cardIdentity,
				occurrence,
			})),
		);
	}
}

function shortIdentity(identity: string): string {
	return identity.length > 18 ? `${identity.slice(0, 8)}…${identity.slice(-4)}` : identity;
}

function truncate(value: string, length: number): string {
	return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
