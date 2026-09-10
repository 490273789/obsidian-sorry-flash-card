const BINARY_CHUNK_BYTES = 32_768;

function base64(data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let binary = "";
	for (let offset = 0; offset < bytes.byteLength; offset += BINARY_CHUNK_BYTES) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_CHUNK_BYTES));
	}
	return btoa(binary);
}

export function createDictionaryResourceUrl(data: ArrayBuffer, mime: string): string {
	if (!mime.startsWith("font/")) return `data:${mime};base64,${base64(data)}`;
	return URL.createObjectURL(new Blob([data], { type: mime }));
}

export function revokeDictionaryResourceUrl(url: string): void {
	if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
