import { TransportError } from "../net/types";
import { AiError, type AiFailureCode } from "./types";

/** Converts an unknown rejection into the stable AI presentation vocabulary. */
export function aiFailureCode(error: unknown): AiFailureCode {
	if (error instanceof AiError || error instanceof TransportError) return error.code;
	return "network";
}

/** HTTP status is transport metadata and never belongs to an AI domain error. */
export function aiFailureHttpStatus(error: unknown): number | null {
	return error instanceof TransportError ? error.httpStatus : null;
}
