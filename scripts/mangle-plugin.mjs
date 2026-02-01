import { readFileSync } from "node:fs";
import { transformAsync } from "@babel/core";
const rename = {};
const mangle = readFileSync("./mangle.json", "utf8");
const mangleJson = JSON.parse(mangle);
for (let prop in mangleJson.props.props) {
	let name = prop;
	if (name[0] === "$") {
		name = name.slice(1);
	}

	rename[name] = mangleJson.props.props[prop];
}
export const manglePlugin = {
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

		return {
			code: transformed.code,
			map: transformed.map,
		};
	},
};
