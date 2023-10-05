import { execSync } from "child_process";
import path from "path";
import fs from "fs";

/*
 * This script packs all packages in the repo, and renames the tarballs to
 * include the branch name if given as the sole command line argument (left out
 * if not given). This is useful for testing the packages in a project without
 * publishing them.
 */

const __dirname = new URL(".", import.meta.url).pathname;
/** @type {(...paths: string[]) => string} Get a path from the repo root */
const p = (...paths) => path.join(__dirname, "..", ...paths);

const packagesDir = p("packages");
const packages = fs
	.readdirSync(packagesDir, { withFileTypes: true })
	.filter(dirent => dirent.isDirectory());

const branch = process.argv[2] ? `-${process.argv[2]}` : "";
for (const pkg of packages) {
	const pkgDir = path.join(packagesDir, pkg.name);
	if (!fs.readdirSync(pkgDir).includes("package.json")) continue;

	console.log(`Packing ${pkg.name}...`);
	const pkgName = execSync(`pnpm pack`, {
		cwd: pkgDir,
		encoding: "utf-8",
	}).trim();
	console.log(pkgName);

	const match = pkgName.match(/([@a-zA-z-]+)-\d+\.\d+\.\d+(?:-.*)?\.tgz/);
	if (!match) {
		console.error(`Failed to parse "${pkgName}"`);
		continue;
	}

	const newName = `${match[1]}${branch}.tgz`;
	fs.renameSync(path.join(pkgDir, pkgName), path.join(pkgDir, newName));
	console.log(`Packed ${newName}`);

	// // Useful to compare the contents of one tarball to another
	// const contents = execSync(
	// 	`tar tvfj ${newName} | awk '{printf "%s\\n",$9}' | sort`,
	// 	{ cwd: pkgDir, encoding: "utf8" }
	// );
	// fs.writeFileSync(path.join(pkgDir, `${branch}-contents.log`), contents);
}
