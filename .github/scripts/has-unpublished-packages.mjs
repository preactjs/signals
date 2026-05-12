import { appendFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([".git", "dist", "node_modules"]);

async function findPackageManifests(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const manifests = [];

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) {
				manifests.push(...(await findPackageManifests(fullPath)));
			}
		} else if (entry.isFile() && entry.name === "package.json") {
			const pkg = JSON.parse(await readFile(fullPath, "utf8"));

			if (!pkg.private && pkg.name && pkg.version) {
				manifests.push({ name: pkg.name, version: pkg.version });
			}
		}
	}

	return manifests;
}

async function hasPublishedVersion(pkg) {
	const response = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`,
		{ headers: { accept: "application/vnd.npm.install-v1+json" } }
	);

	if (response.status === 404) {
		return false;
	}

	if (!response.ok) {
		throw new Error(
			`Failed to query ${pkg.name}: ${response.status} ${response.statusText}`
		);
	}

	const metadata = await response.json();
	return Object.prototype.hasOwnProperty.call(
		metadata.versions ?? {},
		pkg.version
	);
}

async function main() {
	const packages = (await findPackageManifests(process.cwd())).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	let hasUnpublished = false;

	for (const pkg of packages) {
		const isPublished = await hasPublishedVersion(pkg);

		if (isPublished) {
			console.log(`${pkg.name}@${pkg.version} is already published`);
		} else {
			console.log(`${pkg.name}@${pkg.version} is not published yet`);
			hasUnpublished = true;
		}
	}

	const output =
		[
			`has_unpublished=${String(hasUnpublished)}`,
			`should_publish=${String(hasUnpublished)}`,
		].join("\n") + "\n";

	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, output);
	} else {
		process.stdout.write(output);
	}
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
