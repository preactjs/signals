// @ts-check
import { readFileSync } from "node:fs";
import { transformAsync } from "@babel/core";

const mangle = JSON.parse(readFileSync("./mangle.json", "utf8"));

/** @type {Record<string, string>} */
const rename = {};
for (let prop in mangle.props.props) {
	let name = prop;
	if (name[0] === "$") {
		name = name.slice(1);
	}

	rename[name] = mangle.props.props[prop];
}

/** @returns {import('vite').Plugin} */
export function manglePlugin() {
	return {
		name: "rename-mangle-properties",
		async transform(code, id) {
			if (id.includes("node_modules")) {
				return null;
			}

			const transformed = await transformAsync(code, {
				filename: id,
				configFile: false,
				plugins: [
					[
						"babel-plugin-transform-rename-properties",
						{
							rename,
						},
					],
				],
			});

			return transformed?.code
				? {
						code: transformed.code,
						map: transformed.map,
					}
				: null;
		},
	};
}
