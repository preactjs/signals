const fs = require("fs");
const path = require("path");

["preact", "react"].forEach((pkg) => {
	const pkgReadme = path.join(__dirname, "..", "packages", pkg, "README.md");
	let readme = fs.readFileSync(pkgReadme, "utf8");

	/**
	 * Fixes an "issue" with how NPM resolves relative links.
	 *
	 * While `../../README.md` will work well on GitHub, as NPM
	 * is unaware of source directory structure, it results in a
	 * broken (404'ing) link.
	 *
	 * We switch the grandparent directory link to one relative to
	 * repo root which NPM is capable of handling.
	 */
	readme = readme.replace(/\((\.\.\/){2}/g, '(./');

	fs.writeFileSync(pkgReadme, readme);
})
