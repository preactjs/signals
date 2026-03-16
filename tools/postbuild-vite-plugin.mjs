import fs from "node:fs";
import path from "node:path";

const dist = path.join("packages", "vite-plugin", "dist");
const nestedDeclarations = path.join(dist, "vite-plugin", "src", "index.d.ts");
const flatDeclarations = path.join(dist, "index.d.ts");
const targetDeclarations = path.join(dist, "vite-plugin.d.ts");

if (fs.existsSync(targetDeclarations)) {
	process.exit(0);
}

const sourceDeclarations = fs.existsSync(nestedDeclarations)
	? nestedDeclarations
	: flatDeclarations;

if (!fs.existsSync(sourceDeclarations)) {
	console.error("Missing vite-plugin declaration entry");
	process.exit(1);
}

fs.renameSync(sourceDeclarations, targetDeclarations);
fs.rmSync(path.join(dist, "vite-plugin"), { recursive: true, force: true });
