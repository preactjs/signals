import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformAsync } from "@babel/core";

export function createEsbuildPlugin() {
	const pending = new Map();
	const cache = new Map();
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const projectRoot = path.resolve(__dirname, "..");

	return {
		name: "react-transform",
		enforce: "pre",
		async transform(code, id) {
			if (
				id.includes("node_modules") ||
				(!id.includes("packages/react/test/shared") &&
					!id.includes("packages/react/runtime/test"))
			) {
				return null;
			}

			if (
				!id.endsWith(".js") &&
				!id.endsWith(".ts") &&
				!id.endsWith(".jsx") &&
				!id.endsWith(".tsx")
			) {
				return null;
			}

			const cached = cache.get(id);

			if (cached && cached.input === code) {
				return {
					code: cached.result,
					map: null,
				};
			}

			let result = code;
			let map = null;

			if (!pending.has(id)) {
				pending.set(id, []);

				const jsx = [
					"@babel/preset-react",
					{
						runtime: "classic",
						pragma: "createElement",
						pragmaFrag: "Fragment",
					},
				];

				const ts = [
					"@babel/preset-typescript",
					{
						jsxPragma: "createElement",
						jsxPragmaFrag: "Fragment",
					},
				];

				const transformPath = path.join(
					projectRoot,
					"packages/react-transform"
				);
				const signalsTransform = [
					transformPath,
					{
						mode: "auto",
					},
				];

				const tmp = await transformAsync(result, {
					filename: id,
					sourceMaps: true,
					presets: [ts, jsx],
					plugins: [signalsTransform],
				});
				result = (tmp && tmp.code) || result;
				map = (tmp && tmp.map) || map;
				cache.set(id, { input: code, result, map });

				const waited = pending.get(id);
				pending.delete(id);
				waited.forEach(fn => fn());
			} else {
				await new Promise(r => {
					pending.get(id).push(r);
				});
				const cached = cache.get(id);
				result = cached.result;
				map = cached.map;
			}

			return {
				code: result,
				map,
			};
		},
	};
}
