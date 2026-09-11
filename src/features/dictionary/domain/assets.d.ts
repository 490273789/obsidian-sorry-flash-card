/**
 * Vite asset type declarations for the dictionary engine.
 *
 * `src/styles.d.ts` only declares CSS/SCSS imports, so the generated WASM glue
 * and the inline worker need their own module declarations.
 */

declare module "*?worker&inline" {
	const WorkerConstructor: new () => Worker;
	export default WorkerConstructor;
}

declare module "*.wasm?url" {
	const url: string;
	export default url;
}
