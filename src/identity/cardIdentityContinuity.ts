import { hasFlashcardSyntax } from "../cards/cardFormat";
import {
	editDeckSource,
	registerMissingCardIdentities,
	rewriteCardIdentityMarkers,
} from "../cards/deckSourceEditor";
import { extractFirstTag, parseFlashcards } from "../cards/parser";
import type { Deck, FlashCard } from "../shared/types";

export interface ContinuitySourceDocument {
	path: string;
	basename: string;
	content: string;
}

export interface ContinuitySourceStore {
	list(): Promise<ContinuitySourceDocument[]>;
	replaceIfUnchanged(
		path: string,
		expectedContent: string,
		nextContent: string,
	): Promise<"written" | "stale">;
}

export type ContinuitySourceCondition =
	| { type: "current" }
	| { type: "legacy"; cardCount: number }
	| {
			type: "last-known-good";
			reason: "identity-conflict" | "identity-ambiguity" | "source-failure";
	  };

export type CardIdentityIssue =
	| {
			id: string;
			ticket: string;
			type: "identity-conflict";
			identity: string;
			affectedSources: string[];
			candidates: CardIdentityCandidate[];
	  }
	| {
			id: string;
			ticket: string;
			type: "identity-ambiguity";
			missingIdentities: string[];
			affectedSources: string[];
			candidates: CardIdentityCandidate[];
	  };

export interface CardIdentityCandidate {
	token: string;
	sourcePath: string;
	front: string;
	back: string;
}

export interface ContinuityJournal {
	id: string;
	type: "migration" | "repair";
	issueId?: string;
	completedSources: string[];
	pendingSources: string[];
	sources: ContinuityJournalSource[];
}

export interface ContinuityJournalSource {
	path: string;
	expectedContent: string;
	nextContent: string;
	identityMap: Record<string, string>;
}

export interface PersistedCardIdentityContinuityState {
	sources: Record<string, ContinuitySourceCondition>;
	issues: CardIdentityIssue[];
	journal: ContinuityJournal | null;
}

export interface CardIdentityContinuityState {
	configuredTags: string[];
	availableTags?: string[];
	decks: Map<string, Deck>;
	continuity: PersistedCardIdentityContinuityState;
}

export interface ContinuityStateStore {
	load(): Promise<CardIdentityContinuityState>;
	commit(state: CardIdentityContinuityState): Promise<void>;
}

export interface ContinuitySessionChange {
	availableIdentities: Set<string>;
	deletedIdentities: Set<string>;
}

export interface ContinuitySessionStore {
	hasActiveSession(): boolean;
	reconcile(change: ContinuitySessionChange): Promise<void>;
}

export interface CardIdentityContinuitySnapshot {
	sources: Record<string, ContinuitySourceCondition>;
	issues: CardIdentityIssue[];
	journal: ContinuityJournal | null;
	migration?: MigrationPreview;
}

export interface MigrationPreview {
	ticket: string;
	sourceCount: number;
	cardCount: number;
	sources: Array<{ deckId: string; deckName: string; cardCount: number }>;
}

export type SynchronizeOutcome =
	| { kind: "current"; changedDeckIds: string[] }
	| { kind: "attention-required"; changedDeckIds: string[]; issueIds: string[] }
	| { kind: "failed"; retryable: boolean; message: string };

export type ContinuityResolution =
	| {
			kind: "migrate";
			ticket: string;
			deckIds: string[];
	  }
	| {
			kind: "repair";
			ticket: string;
			issueId: string;
			successors: Array<{ cardIdentity: string; occurrence: string | null }>;
	  };

export type ResolutionOutcome =
	| { kind: "applied" }
	| { kind: "resumable"; completedDeckIds: string[]; pendingDeckIds: string[] }
	| { kind: "blocked"; reason: "active-session" | "preview-expired" | "source-changing" }
	| { kind: "failed"; retryable: boolean; message: string };

export interface CardContentChange {
	front: string;
	back: string;
	explanation?: string;
}

export type PluginCardChange =
	| { kind: "add"; deckId: string; content: CardContentChange }
	| { kind: "edit"; cardIdentity: string; content: CardContentChange }
	| { kind: "delete"; cardIdentity: string };

export type CardChangeOutcome =
	| { kind: "applied"; cardIdentity?: string }
	| { kind: "blocked"; reason: "source-needs-repair" | "migration-required"; issueId?: string }
	| { kind: "source-changing"; deckId: string }
	| { kind: "failed"; retryable: boolean; message: string };

export interface CardIdentityContinuity {
	synchronize(): Promise<SynchronizeOutcome>;
	change(change: PluginCardChange): Promise<CardChangeOutcome>;
	inspect(): CardIdentityContinuitySnapshot;
	resolve(resolution: ContinuityResolution): Promise<ResolutionOutcome>;
}

export interface CreateCardIdentityContinuityOptions {
	sources: ContinuitySourceStore;
	state: ContinuityStateStore;
	sessions?: ContinuitySessionStore;
	createIdentity: () => string;
}

interface PreparedSource {
	document: ContinuitySourceDocument;
	tag: string;
	cards: FlashCard[];
	existingDeck: Deck | undefined;
	sourceContent: string;
}

export function createCardIdentityContinuity(
	options: CreateCardIdentityContinuityOptions,
): CardIdentityContinuity {
	return new DefaultCardIdentityContinuity(options);
}

class DefaultCardIdentityContinuity implements CardIdentityContinuity {
	private snapshot: CardIdentityContinuitySnapshot = {
		sources: {},
		issues: [],
		journal: null,
	};
	private operationTail: Promise<void> = Promise.resolve();

	constructor(private readonly options: CreateCardIdentityContinuityOptions) {}

	synchronize(): Promise<SynchronizeOutcome> {
		return this.enqueue(() => this.synchronizeNow());
	}

	private async synchronizeNow(): Promise<SynchronizeOutcome> {
		try {
			let [documents, currentState] = await Promise.all([
				this.options.sources.list(),
				this.options.state.load(),
			]);
			if (currentState.continuity.journal) {
				const recovery = await this.executeJournal(documents, currentState);
				if (recovery.kind !== "applied") {
					return {
						kind: "failed",
						retryable: recovery.kind === "resumable" || recovery.kind === "failed",
						message:
							recovery.kind === "failed"
								? recovery.message
								: "Card identity journal is waiting for the source to stop changing",
					};
				}
				[documents, currentState] = await Promise.all([
					this.options.sources.list(),
					this.options.state.load(),
				]);
			}
			const configuredTags = new Set(
				currentState.configuredTags.map((tag) => tag.toLowerCase()),
			);
			const existingCards = buildExistingCardMap(currentState.decks);
			const nextDecks = new Map<string, Deck>();
			const nextSources: Record<string, ContinuitySourceCondition> = {};
			const preparedSources: PreparedSource[] = [];
			const availableTags = new Set<string>();
			let attentionRequired = false;

			for (const document of documents) {
				const tag = extractFirstTag(document.content);
				if (tag && hasFlashcardSyntax(document.content)) availableTags.add(tag);
				if (
					!tag ||
					!configuredTags.has(tag.toLowerCase()) ||
					!hasFlashcardSyntax(document.content)
				) {
					continue;
				}

				let sourceContent = document.content;
				const existingDeck = currentState.decks.get(document.path);
				if (
					existingDeck &&
					existingDeck.cards.some((card) => isLegacyIdentity(document.path, card.id))
				) {
					nextDecks.set(document.path, existingDeck);
					nextSources[document.path] = {
						type: "legacy",
						cardCount: existingDeck.cards.length,
					};
					attentionRequired = true;
					continue;
				}
				if (!existingDeck) {
					const registration = registerMissingCardIdentities(
						sourceContent,
						this.options.createIdentity,
					);
					if (registration.registeredIdentities.length > 0) {
						const writeResult = await this.options.sources.replaceIfUnchanged(
							document.path,
							document.content,
							registration.nextContent,
						);
						if (writeResult === "stale") {
							return {
								kind: "failed",
								retryable: true,
								message: `Source changed before identity registration: ${document.path}`,
							};
						}
						sourceContent = registration.nextContent;
					}
				}

				const cards = parseFlashcards(sourceContent, document.path, existingCards);
				if (cards.length === 0) continue;
				preparedSources.push({ document, tag, cards, existingDeck, sourceContent });
			}

			const currentStableIdentities = new Set(
				preparedSources.flatMap((source) =>
					source.cards
						.filter((card) => !isLegacyIdentity(source.document.path, card.id))
						.map((card) => card.id),
				),
			);
			const ambiguities: CardIdentityIssue[] = [];
			for (const source of preparedSources) {
				if (!source.existingDeck) continue;
				const hasUnmarkedCard = source.cards.some((card) =>
					isLegacyIdentity(source.document.path, card.id),
				);
				if (!hasUnmarkedCard) continue;

				const missingIdentities = source.existingDeck.cards
					.map((card) => card.id)
					.filter((identity) => !currentStableIdentities.has(identity));
				if (missingIdentities.length > 0) {
					const candidates = source.cards
						.filter((card) => isLegacyIdentity(source.document.path, card.id))
						.map((card, index) => makeCandidate(source, card, index));
					ambiguities.push({
						id: `identity-ambiguity:${source.document.path}`,
						ticket: buildIssueTicket("identity-ambiguity", [source]),
						type: "identity-ambiguity",
						missingIdentities,
						affectedSources: [source.document.path],
						candidates,
					});
					continue;
				}

				const registration = registerMissingCardIdentities(
					source.sourceContent,
					this.options.createIdentity,
				);
				const writeResult = await this.options.sources.replaceIfUnchanged(
					source.document.path,
					source.document.content,
					registration.nextContent,
				);
				if (writeResult === "stale") {
					return {
						kind: "failed",
						retryable: true,
						message: `Source changed before identity registration: ${source.document.path}`,
					};
				}
				source.sourceContent = registration.nextContent;
				source.cards = parseFlashcards(
					registration.nextContent,
					source.document.path,
					existingCards,
				);
			}

			const conflicts = findIdentityConflicts(preparedSources);
			const conflictPaths = new Set(
				conflicts.flatMap((conflict) => conflict.affectedSources),
			);
			const ambiguityPaths = new Set(
				ambiguities.flatMap((ambiguity) => ambiguity.affectedSources),
			);
			if (conflicts.length > 0 || ambiguities.length > 0) attentionRequired = true;

			for (const source of preparedSources) {
				if (
					conflictPaths.has(source.document.path) ||
					ambiguityPaths.has(source.document.path)
				) {
					if (source.existingDeck) {
						nextDecks.set(source.document.path, source.existingDeck);
					}
					nextSources[source.document.path] = {
						type: "last-known-good",
						reason: ambiguityPaths.has(source.document.path)
							? "identity-ambiguity"
							: "identity-conflict",
					};
					continue;
				}

				nextDecks.set(source.document.path, {
					id: source.document.path,
					name: source.document.basename,
					filePath: source.document.path,
					tag: source.tag,
					cards: source.cards,
					studyCount: source.existingDeck?.studyCount ?? 0,
					lastStudied: source.existingDeck?.lastStudied ?? null,
				});
				nextSources[source.document.path] = { type: "current" };
			}

			const nextContinuity: PersistedCardIdentityContinuityState = {
				sources: nextSources,
				issues: [...conflicts, ...ambiguities],
				journal: currentState.continuity.journal,
			};
			await this.options.state.commit({
				...currentState,
				availableTags: Array.from(availableTags),
				decks: nextDecks,
				continuity: nextContinuity,
			});
			await this.reconcileSessions(currentState.decks, nextDecks);
			this.snapshot = cloneSnapshot(
				nextContinuity,
				buildMigrationPreview(documents, nextDecks, nextSources),
			);

			return attentionRequired
				? {
						kind: "attention-required",
						changedDeckIds: Array.from(nextDecks.keys()),
						issueIds: [...conflicts, ...ambiguities].map((issue) => issue.id),
					}
				: {
						kind: "current",
						changedDeckIds: Array.from(nextDecks.keys()),
					};
		} catch (error) {
			return {
				kind: "failed",
				retryable: true,
				message: error instanceof Error ? error.message : "Card identity sync failed",
			};
		}
	}

	change(change: PluginCardChange): Promise<CardChangeOutcome> {
		return this.enqueue(() => this.changeNow(change));
	}

	private async changeNow(change: PluginCardChange): Promise<CardChangeOutcome> {
		try {
			let [documents, currentState] = await Promise.all([
				this.options.sources.list(),
				this.options.state.load(),
			]);
			if (currentState.continuity.journal) {
				const recovery = await this.executeJournal(documents, currentState);
				if (recovery.kind !== "applied") {
					return {
						kind: "failed",
						retryable: true,
						message: "An unfinished card identity operation is waiting to resume",
					};
				}
				[documents, currentState] = await Promise.all([
					this.options.sources.list(),
					this.options.state.load(),
				]);
			}
			const deck =
				change.kind === "add"
					? currentState.decks.get(change.deckId)
					: Array.from(currentState.decks.values()).find((candidate) =>
							candidate.cards.some((card) => card.id === change.cardIdentity),
						);
			if (!deck) {
				return { kind: "failed", retryable: false, message: "Deck or card not found" };
			}

			const condition = currentState.continuity.sources[deck.filePath];
			if (condition?.type === "legacy") {
				return { kind: "blocked", reason: "migration-required" };
			}
			if (condition?.type === "last-known-good") {
				const issue = currentState.continuity.issues.find((candidate) =>
					candidate.affectedSources.includes(deck.filePath),
				);
				return {
					kind: "blocked",
					reason: "source-needs-repair",
					issueId: issue?.id,
				};
			}

			const document = documents.find((candidate) => candidate.path === deck.filePath);
			if (!document) {
				return { kind: "failed", retryable: false, message: "Source file not found" };
			}
			const newIdentity = change.kind === "add" ? this.options.createIdentity() : undefined;
			const editResult = editDeckSource(
				document.content,
				deck,
				change.kind === "add"
					? { type: "add", cardId: newIdentity, ...change.content }
					: change.kind === "edit"
						? { type: "update", cardId: change.cardIdentity, ...change.content }
						: { type: "delete", cardId: change.cardIdentity },
			);
			const writeResult = await this.options.sources.replaceIfUnchanged(
				deck.filePath,
				document.content,
				editResult.nextContent,
			);
			if (writeResult === "stale") {
				return { kind: "source-changing", deckId: deck.id };
			}

			const syncOutcome = await this.synchronizeNow();
			if (syncOutcome.kind === "failed") return syncOutcome;
			return newIdentity
				? { kind: "applied", cardIdentity: newIdentity }
				: { kind: "applied" };
		} catch (error) {
			return {
				kind: "failed",
				retryable: false,
				message: error instanceof Error ? error.message : "Card source change failed",
			};
		}
	}

	resolve(resolution: ContinuityResolution): Promise<ResolutionOutcome> {
		return this.enqueue(() => this.resolveNow(resolution));
	}

	private async resolveNow(resolution: ContinuityResolution): Promise<ResolutionOutcome> {
		if (resolution.kind === "repair") return this.resolveRepair(resolution);

		try {
			let [documents, currentState] = await Promise.all([
				this.options.sources.list(),
				this.options.state.load(),
			]);
			if (currentState.continuity.journal) {
				const recovery = await this.executeJournal(documents, currentState);
				if (recovery.kind !== "applied") return recovery;
				[documents, currentState] = await Promise.all([
					this.options.sources.list(),
					this.options.state.load(),
				]);
			}
			if (this.options.sessions?.hasActiveSession()) {
				return { kind: "blocked", reason: "active-session" };
			}
			const preview = buildMigrationPreview(
				documents,
				currentState.decks,
				currentState.continuity.sources,
			);
			if (!preview || preview.ticket !== resolution.ticket) {
				return { kind: "blocked", reason: "preview-expired" };
			}

			const selected = new Set(resolution.deckIds);
			const plans: ContinuityJournalSource[] = [];
			for (const source of preview.sources) {
				if (!selected.has(source.deckId)) continue;
				const document = documents.find((candidate) => candidate.path === source.deckId);
				const deck = currentState.decks.get(source.deckId);
				if (!document || !deck) continue;

				const registration = registerMissingCardIdentities(
					document.content,
					this.options.createIdentity,
				);
				const migratedCards = parseFlashcards(registration.nextContent, document.path);
				if (
					migratedCards.length !== deck.cards.length ||
					migratedCards.some((card) => isLegacyIdentity(document.path, card.id))
				) {
					return { kind: "blocked", reason: "preview-expired" };
				}
				plans.push({
					path: source.deckId,
					expectedContent: document.content,
					nextContent: registration.nextContent,
					identityMap: Object.fromEntries(
						deck.cards.map((card, index) => [card.id, migratedCards[index]?.id ?? ""]),
					),
				});
			}

			const journal: ContinuityJournal = {
				id: resolution.ticket,
				type: "migration",
				completedSources: [],
				pendingSources: plans.map((plan) => plan.path),
				sources: plans,
			};
			await this.options.state.commit({
				...currentState,
				continuity: { ...currentState.continuity, journal },
			});
			return this.executeJournal(documents, {
				...currentState,
				continuity: { ...currentState.continuity, journal },
			});
		} catch (error) {
			return {
				kind: "failed",
				retryable: true,
				message: error instanceof Error ? error.message : "Card identity migration failed",
			};
		}
	}

	private async resolveRepair(
		resolution: Extract<ContinuityResolution, { kind: "repair" }>,
	): Promise<ResolutionOutcome> {
		try {
			let [documents, currentState] = await Promise.all([
				this.options.sources.list(),
				this.options.state.load(),
			]);
			if (currentState.continuity.journal) {
				const recovery = await this.executeJournal(documents, currentState);
				if (recovery.kind !== "applied") return recovery;
				[documents, currentState] = await Promise.all([
					this.options.sources.list(),
					this.options.state.load(),
				]);
			}
			const issue = currentState.continuity.issues.find(
				(candidate) => candidate.id === resolution.issueId,
			);
			if (!issue || issue.ticket !== resolution.ticket) {
				return { kind: "blocked", reason: "preview-expired" };
			}

			const documentsByPath = new Map(documents.map((document) => [document.path, document]));
			const ticketMaterial = issue.affectedSources
				.map((path) => {
					const document = documentsByPath.get(path);
					return document ? `${path}:${hashText(document.content)}` : `${path}:missing`;
				})
				.sort()
				.join("|");
			if (`${issue.type}:${hashText(ticketMaterial)}` !== issue.ticket) {
				return { kind: "blocked", reason: "preview-expired" };
			}
			const expectedIdentities = new Set(
				issue.type === "identity-conflict" ? [issue.identity] : issue.missingIdentities,
			);
			const candidateTokens = new Set(issue.candidates.map((candidate) => candidate.token));
			const selectedOccurrences = resolution.successors.flatMap((successor) =>
				successor.occurrence ? [successor.occurrence] : [],
			);
			if (
				resolution.successors.length !== expectedIdentities.size ||
				resolution.successors.some(
					(successor) =>
						!expectedIdentities.has(successor.cardIdentity) ||
						(successor.occurrence !== null && !candidateTokens.has(successor.occurrence)),
				) ||
				new Set(resolution.successors.map((successor) => successor.cardIdentity)).size !==
					expectedIdentities.size ||
				new Set(selectedOccurrences).size !== selectedOccurrences.length
			) {
				return { kind: "blocked", reason: "preview-expired" };
			}

			const successorByOccurrence = new Map(
				resolution.successors.flatMap((successor) =>
					successor.occurrence
						? [[successor.occurrence, successor.cardIdentity] as const]
						: [],
				),
			);
			const existingCards = buildExistingCardMap(currentState.decks);
			const plans: ContinuityJournalSource[] = [];
			for (const path of issue.affectedSources) {
				const document = documentsByPath.get(path);
				if (!document) return { kind: "blocked", reason: "preview-expired" };
				const cards = parseFlashcards(document.content, path, existingCards);
				const contentHash = hashText(document.content);
				const desiredIdentities = cards.map((card, index) => {
					const occurrence = `${path}:${contentHash}:${index}`;
					const assignedIdentity = successorByOccurrence.get(occurrence);
					if (assignedIdentity) return assignedIdentity;
					if (
						!isLegacyIdentity(path, card.id) &&
						!(issue.type === "identity-conflict" && card.id === issue.identity)
					) {
						return card.id;
					}
					return this.options.createIdentity();
				});
				plans.push({
					path,
					expectedContent: document.content,
					nextContent: rewriteCardIdentityMarkers(document.content, desiredIdentities),
					identityMap: Object.fromEntries(
						resolution.successors.map((successor) => [
							successor.cardIdentity,
							successor.occurrence ? successor.cardIdentity : "",
						]),
					),
				});
			}

			const journal: ContinuityJournal = {
				id: resolution.ticket,
				type: "repair",
				issueId: issue.id,
				completedSources: [],
				pendingSources: plans.map((plan) => plan.path),
				sources: plans,
			};
			await this.options.state.commit({
				...currentState,
				continuity: { ...currentState.continuity, journal },
			});
			return this.executeJournal(documents, {
				...currentState,
				continuity: { ...currentState.continuity, journal },
			});
		} catch (error) {
			return {
				kind: "failed",
				retryable: true,
				message: error instanceof Error ? error.message : "Card identity repair failed",
			};
		}
	}

	private async executeJournal(
		documents: ContinuitySourceDocument[],
		currentState: CardIdentityContinuityState,
	): Promise<ResolutionOutcome> {
		const persistedJournal = currentState.continuity.journal;
		if (!persistedJournal) return { kind: "applied" };
		const journal: ContinuityJournal = {
			...persistedJournal,
			completedSources: [...persistedJournal.completedSources],
			pendingSources: [...persistedJournal.pendingSources],
			sources: persistedJournal.sources.map((source) => ({
				...source,
				identityMap: { ...source.identityMap },
			})),
		};
		const documentsByPath = new Map(documents.map((document) => [document.path, document]));

		for (const plan of journal.sources) {
			const document = documentsByPath.get(plan.path);
			if (!document) {
				return {
					kind: "resumable",
					completedDeckIds: journal.completedSources,
					pendingDeckIds: journal.pendingSources,
				};
			}
			if (document.content !== plan.nextContent) {
				if (document.content !== plan.expectedContent) {
					return {
						kind: "resumable",
						completedDeckIds: journal.completedSources,
						pendingDeckIds: journal.pendingSources,
					};
				}
				const writeResult = await this.options.sources.replaceIfUnchanged(
					plan.path,
					plan.expectedContent,
					plan.nextContent,
				);
				if (writeResult === "stale") {
					return {
						kind: "resumable",
						completedDeckIds: journal.completedSources,
						pendingDeckIds: journal.pendingSources,
					};
				}
				document.content = plan.nextContent;
			}

			if (!journal.completedSources.includes(plan.path)) {
				journal.completedSources.push(plan.path);
			}
			journal.pendingSources = journal.pendingSources.filter((path) => path !== plan.path);
			await this.options.state.commit({
				...currentState,
				continuity: { ...currentState.continuity, journal: cloneJournal(journal) },
			});
		}

		const previousDecks = currentState.decks;
		const nextDecks = new Map(previousDecks);
		const nextSources = { ...currentState.continuity.sources };
		const remainingIssues =
			journal.type === "repair" && journal.issueId
				? currentState.continuity.issues.filter((issue) => issue.id !== journal.issueId)
				: currentState.continuity.issues;
		const existingCards =
			journal.type === "migration"
				? buildMigratedCardMap(previousDecks, journal.sources)
				: buildExistingCardMap(previousDecks);
		for (const plan of journal.sources) {
			const document = documentsByPath.get(plan.path);
			const tag = extractFirstTag(plan.nextContent);
			if (!document || !tag) continue;
			const remainingIssue = remainingIssues.find((issue) =>
				issue.affectedSources.includes(plan.path),
			);
			if (remainingIssue) {
				nextSources[plan.path] = {
					type: "last-known-good",
					reason:
						remainingIssue.type === "identity-conflict"
							? "identity-conflict"
							: "identity-ambiguity",
				};
				continue;
			}
			const existingDeck = previousDecks.get(plan.path);
			nextDecks.set(plan.path, {
				id: plan.path,
				name: document.basename,
				filePath: plan.path,
				tag,
				cards: parseFlashcards(plan.nextContent, plan.path, existingCards),
				studyCount: existingDeck?.studyCount ?? 0,
				lastStudied: existingDeck?.lastStudied ?? null,
			});
			nextSources[plan.path] = { type: "current" };
		}

		const nextContinuity: PersistedCardIdentityContinuityState = {
			sources: nextSources,
			issues: remainingIssues,
			journal: null,
		};
		await this.options.state.commit({
			...currentState,
			decks: nextDecks,
			continuity: nextContinuity,
		});
		await this.reconcileSessions(previousDecks, nextDecks);
		this.snapshot = cloneSnapshot(
			nextContinuity,
			buildMigrationPreview(documents, nextDecks, nextSources),
		);
		return { kind: "applied" };
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.operationTail.then(operation, operation);
		this.operationTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	inspect(): CardIdentityContinuitySnapshot {
		return cloneSnapshot(this.snapshot, this.snapshot.migration);
	}

	private async reconcileSessions(
		previousDecks: ReadonlyMap<string, Deck>,
		nextDecks: ReadonlyMap<string, Deck>,
	): Promise<void> {
		if (!this.options.sessions) return;
		const previousIdentities = new Set(
			Array.from(previousDecks.values()).flatMap((deck) => deck.cards.map((card) => card.id)),
		);
		const availableIdentities = new Set(
			Array.from(nextDecks.values()).flatMap((deck) => deck.cards.map((card) => card.id)),
		);
		const deletedIdentities = new Set(
			Array.from(previousIdentities).filter((identity) => !availableIdentities.has(identity)),
		);
		await this.options.sessions.reconcile({ availableIdentities, deletedIdentities });
	}
}

function isLegacyIdentity(filePath: string, cardIdentity: string): boolean {
	return cardIdentity.startsWith(`${filePath}::`);
}

function findIdentityConflicts(sources: PreparedSource[]): CardIdentityIssue[] {
	const occurrences = new Map<
		string,
		Array<{ source: PreparedSource; card: FlashCard; index: number }>
	>();
	for (const source of sources) {
		for (let index = 0; index < source.cards.length; index++) {
			const card = source.cards[index];
			if (!card) continue;
			const matches = occurrences.get(card.id) ?? [];
			matches.push({ source, card, index });
			occurrences.set(card.id, matches);
		}
	}

	const issues: CardIdentityIssue[] = [];
	for (const [identity, matches] of occurrences) {
		if (matches.length < 2) continue;
		const affectedSources = Array.from(
			new Set(matches.map(({ source }) => source.document.path)),
		);
		const affectedPreparedSources = sources.filter((source) =>
			affectedSources.includes(source.document.path),
		);
		issues.push({
			id: `identity-conflict:${identity}`,
			ticket: buildIssueTicket("identity-conflict", affectedPreparedSources),
			type: "identity-conflict",
			identity,
			affectedSources,
			candidates: matches.map(({ source, card, index }) =>
				makeCandidate(source, card, index),
			),
		});
	}
	return issues;
}

function makeCandidate(
	source: PreparedSource,
	card: FlashCard,
	index: number,
): CardIdentityCandidate {
	return {
		token: `${source.document.path}:${hashText(source.sourceContent)}:${index}`,
		sourcePath: source.document.path,
		front: card.front,
		back: card.back,
	};
}

function buildIssueTicket(type: CardIdentityIssue["type"], sources: PreparedSource[]): string {
	const material = sources
		.map((source) => `${source.document.path}:${hashText(source.sourceContent)}`)
		.sort()
		.join("|");
	return `${type}:${hashText(material)}`;
}

function buildExistingCardMap(decks: ReadonlyMap<string, Deck>): Map<string, FlashCard> {
	const cards = new Map<string, FlashCard>();
	for (const deck of decks.values()) {
		for (const card of deck.cards) {
			cards.set(card.id, card);
		}
	}
	return cards;
}

function buildMigratedCardMap(
	decks: ReadonlyMap<string, Deck>,
	plans: ContinuityJournalSource[],
): Map<string, FlashCard> {
	const mapped = new Map<string, FlashCard>();
	const mapsByPath = new Map(plans.map((plan) => [plan.path, plan.identityMap]));
	for (const deck of decks.values()) {
		const identityMap = mapsByPath.get(deck.filePath);
		for (const card of deck.cards) {
			const identity = identityMap?.[card.id] ?? card.id;
			mapped.set(identity, { ...card, id: identity });
		}
	}
	return mapped;
}

function buildMigrationPreview(
	documents: ContinuitySourceDocument[],
	decks: ReadonlyMap<string, Deck>,
	sources: Record<string, ContinuitySourceCondition>,
): MigrationPreview | undefined {
	const legacySources = Object.entries(sources)
		.filter(([, condition]) => condition.type === "legacy")
		.map(([path]) => {
			const deck = decks.get(path);
			const document = documents.find((candidate) => candidate.path === path);
			return deck && document
				? {
						deckId: path,
						deckName: deck.name,
						cardCount: deck.cards.length,
						content: document.content,
					}
				: null;
		})
		.filter((source): source is NonNullable<typeof source> => source !== null)
		.sort((left, right) => left.deckId.localeCompare(right.deckId));
	if (legacySources.length === 0) return undefined;

	const ticketMaterial = legacySources
		.map((source) => `${source.deckId}:${hashText(source.content)}`)
		.join("|");
	return {
		ticket: `migration:${hashText(ticketMaterial)}`,
		sourceCount: legacySources.length,
		cardCount: legacySources.reduce((total, source) => total + source.cardCount, 0),
		sources: legacySources.map(({ deckId, deckName, cardCount }) => ({
			deckId,
			deckName,
			cardCount,
		})),
	};
}

function hashText(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneSnapshot(
	state: PersistedCardIdentityContinuityState,
	migration?: MigrationPreview,
): CardIdentityContinuitySnapshot {
	return {
		sources: { ...state.sources },
		issues: state.issues.map((issue) => ({
			...issue,
			affectedSources: [...issue.affectedSources],
			candidates: issue.candidates.map((candidate) => ({ ...candidate })),
			...(issue.type === "identity-ambiguity"
				? { missingIdentities: [...issue.missingIdentities] }
				: {}),
		})),
		journal: state.journal ? cloneJournal(state.journal) : null,
		migration: migration
			? {
					...migration,
					sources: migration.sources.map((source) => ({ ...source })),
				}
			: undefined,
	};
}

function cloneJournal(journal: ContinuityJournal): ContinuityJournal {
	return {
		...journal,
		completedSources: [...journal.completedSources],
		pendingSources: [...journal.pendingSources],
		sources: journal.sources.map((source) => ({
			...source,
			identityMap: { ...source.identityMap },
		})),
	};
}
