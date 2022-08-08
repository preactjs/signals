const fs = require("fs");
const path = require("path");

const pkgDir = path.join(__dirname, "..", "packages");
const pkgs = fs.readdirSync(pkgDir);

const copy = dir => {
	let name = JSON.parse(fs.readFileSync(path.join(pkgDir, dir, "package.json")))
		.name;
	name = name.replace(/^(@[a-z_0-9]*)/, "");

	// Copy .module.js --> .mjs for Node 13 compat.
	fs.writeFileSync(
		path.join(pkgDir, dir, "dist", `${name}.mjs`),
		fs.readFileSync(path.join(pkgDir, dir, "dist", `${name}.module.js`))
	);
};

pkgs.forEach(copy);
