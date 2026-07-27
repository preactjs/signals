#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const config = JSON.parse(
	readFileSync(join(root, ".changeset/config.json"), "utf8")
);
const ignored = new Set(config.ignore || []);
const access = config.access || "public";
const maxStageAttempts = 4;
const stageRetryDelay = 10_000;

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function packageJsonPathsFromPnpmWorkspace() {
	const workspace = join(root, "pnpm-workspace.yaml");
	if (!existsSync(workspace)) return [];

	const patterns = [];
	for (const rawLine of readFileSync(workspace, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line.startsWith("- ")) continue;
		const pattern = line.slice(2).replace(/^['\"]|['\"]$/g, "");
		if (!pattern || pattern.startsWith("!")) continue;
		patterns.push(pattern);
	}

	const paths = [];
	for (const pattern of patterns) {
		if (pattern.endsWith("/*")) {
			const dir = join(root, pattern.slice(0, -2));
			if (!existsSync(dir)) continue;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				if (entry.isDirectory())
					paths.push(join(dir, entry.name, "package.json"));
			}
		} else if (pattern.endsWith("/**")) {
			// These workspaces are docs/examples and not published packages in this release flow.
			continue;
		} else {
			paths.push(join(root, pattern, "package.json"));
		}
	}

	return paths;
}

function packageJsonPaths() {
	const paths = new Set(packageJsonPathsFromPnpmWorkspace());
	paths.add(join(root, "package.json"));
	return [...paths].filter(existsSync);
}

function versionExists(name, version) {
	const result = spawnSync(
		"npm",
		["view", `${name}@${version}`, "version", "--json"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}
	);

	if (result.status === 0) return true;
	const output = `${result.stdout}\n${result.stderr}`;
	if (output.includes("E404") || output.includes("No match found"))
		return false;

	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	throw new Error(`Could not check npm version for ${name}@${version}`);
}

function distTag(version) {
	const prerelease = version.match(/^[^-]+-([0-9A-Za-z-]+)/);
	return prerelease ? prerelease[1] : "latest";
}

function isTransientRegistryError(result) {
	const output = `${result.stdout}\n${result.stderr}`;
	return /\bE5\d{2}\b/.test(output);
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function stagePackage(name, args) {
	for (let attempt = 1; attempt <= maxStageAttempts; attempt++) {
		const result = spawnSync("pnpm", args, {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);

		if (result.status === 0) return result;
		if (attempt === maxStageAttempts || !isTransientRegistryError(result))
			return result;

		const delay = stageRetryDelay * 2 ** (attempt - 1);
		console.log(
			`npm returned a transient server error while staging ${name}. Retrying in ${delay / 1000}s...`
		);
		await wait(delay);
	}
}

function runGit(args) {
	const result = spawnSync("git", args, {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	if (result.status !== 0) process.exit(result.status || 1);
}

function hasLocalGitTag(tagName) {
	const result = spawnSync(
		"git",
		["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`],
		{
			cwd: root,
			stdio: "ignore",
		}
	);
	return result.status === 0;
}

function createGitTag(tagName) {
	if (hasLocalGitTag(tagName)) {
		console.log(`Git tag ${tagName} already exists locally.`);
	} else {
		runGit(["tag", tagName, "-m", tagName]);
	}

	// changesets/action parses this line, then pushes the tag and creates the GitHub release.
	console.log(`New tag: ${tagName}`);
}

const staged = [];
for (const packageJsonPath of packageJsonPaths()) {
	const pkg = readJson(packageJsonPath);
	if (!pkg.name || !pkg.version || pkg.private || ignored.has(pkg.name))
		continue;
	if (versionExists(pkg.name, pkg.version)) {
		console.log(`Skipping ${pkg.name}@${pkg.version}; already published.`);
		continue;
	}

	const packageDir = dirname(packageJsonPath);
	const tag = distTag(pkg.version);
	const args = [
		"stage",
		"publish",
		packageDir,
		"--provenance",
		"--access",
		pkg.publishConfig?.access || access,
		"--tag",
		tag,
		"--json",
	];

	console.log(`Staging ${pkg.name}@${pkg.version} with dist-tag ${tag}...`);
	const result = await stagePackage(`${pkg.name}@${pkg.version}`, args);
	if (result.status !== 0) process.exit(result.status || 1);

	const stageId = result.stdout.match(/"stageId"\s*:\s*"([^"]+)"/)?.[1];
	const tagName = `${pkg.name}@${pkg.version}`;
	createGitTag(tagName);

	staged.push({
		name: pkg.name,
		version: pkg.version,
		path: relative(root, packageDir) || ".",
		stageId,
	});
}

if (staged.length === 0) {
	console.log("No unpublished packages to stage.");
} else {
	console.log("Staged packages:");
	for (const pkg of staged) {
		console.log(
			`- ${pkg.name}@${pkg.version}${pkg.stageId ? ` (${pkg.stageId})` : ""}`
		);
	}
	console.log(
		"Approve staged packages with `npm stage approve <stage-id>` after review."
	);
}
