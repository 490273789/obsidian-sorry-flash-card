import { readFile, writeFile } from "node:fs/promises";

const version = process.env.npm_package_version;
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
	throw new Error("npm_package_version is missing or invalid");
}

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.version = version;
await writeFile("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);

const versions = JSON.parse(await readFile("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
await writeFile("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);
