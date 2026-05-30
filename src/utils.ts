/**
 * Fisher-Yates shuffle — returns a new array with elements in random order.
 * Produces an unbiased permutation, unlike sort(() => Math.random() - 0.5).
 */
export function shuffleArray<T>(arr: readonly T[]): T[] {
	const result = [...arr];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j]!, result[i]!];
	}
	return result;
}
