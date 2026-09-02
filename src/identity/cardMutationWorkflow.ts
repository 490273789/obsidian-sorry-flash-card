import type { Language } from "../shared/types";
import type { TranslationKey, TranslationVars } from "../i18n";
import type { CardIdentityContinuity, PluginCardChange } from "./cardIdentityContinuity";
import { describeCardChangeOutcome } from "./synchronizationFeedback";

export type CardMutationRequest =
	| {
			kind: "create";
			deckId: string;
			content: {
				front: string;
				back: string;
				explanation?: string;
			};
	  }
	| {
			kind: "edit";
			deckId: string;
			cardId: string;
			content: {
				front: string;
				back: string;
				explanation?: string;
			};
	  }
	| {
			kind: "delete";
			deckId: string;
			cardId: string;
	  };

export interface CardMutationWorkflowOptions {
	language: Language;
	onRequestMigration: (deckId: string) => Promise<boolean>;
	notify: (message: string) => void;
	t: (key: TranslationKey, vars?: TranslationVars) => string;
}

export type CardMutationWorkflowOutcome =
	| { kind: "applied"; cardIdentity?: string }
	| { kind: "migrating" }
	| { kind: "failed"; message: string };

export async function executeCardMutationWorkflow(
	continuity: Pick<CardIdentityContinuity, "change">,
	request: CardMutationRequest,
	options: CardMutationWorkflowOptions,
): Promise<CardMutationWorkflowOutcome> {
	const changeRequest: PluginCardChange =
		request.kind === "create"
			? {
					kind: "add",
					deckId: request.deckId,
					content: request.content,
				}
			: request.kind === "edit"
				? {
						kind: "edit",
						deckId: request.deckId,
						cardIdentity: request.cardId,
						content: request.content,
					}
				: {
						kind: "delete",
						deckId: request.deckId,
						cardIdentity: request.cardId,
					};

	const outcome = await continuity.change(changeRequest);

	if (outcome.kind === "blocked" && outcome.reason === "migration-required") {
		await options.onRequestMigration(request.deckId);
		return { kind: "migrating" };
	}

	if (outcome.kind !== "applied") {
		const message = describeCardChangeOutcome(outcome, options.language);
		const noticeKey: TranslationKey =
			request.kind === "delete" ? "notice.cardDeleteFailed" : "notice.cardSaveFailed";
		options.notify(options.t(noticeKey, { message }));
		return { kind: "failed", message };
	}

	const noticeKey: TranslationKey =
		request.kind === "create"
			? "notice.cardAdded"
			: request.kind === "edit"
				? "notice.cardSaved"
				: "notice.cardDeleted";
	options.notify(options.t(noticeKey));

	return {
		kind: "applied",
		cardIdentity: "cardIdentity" in outcome ? outcome.cardIdentity : undefined,
	};
}
