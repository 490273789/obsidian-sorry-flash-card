export { sandboxDocumentIdentity, sandboxDocumentSource, type SandboxDocument } from "./document";
export {
	createDictionarySandboxHost,
	type DictionarySandboxHost,
	type DictionarySandboxHostOptions,
} from "./host";
export { prepareDictionarySandboxDocument, type DictionarySandboxOptions } from "./prepare";
export type {
	DictionarySandboxAction,
	DictionarySandboxEnvelope,
	DictionarySandboxStorageMutation,
	DictionaryTheme,
} from "./protocol";
