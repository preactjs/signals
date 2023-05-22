import { transform } from "@babel/core";
import signalsTransform from "../../src/index";

function dedent(str: string) {
	let result = str;

	const lines = str.split("\n");
	let minIndent: number = Number.MAX_SAFE_INTEGER;
	lines.forEach(function (l) {
		const m = l.match(/^(\s+)\S+/);
		if (m) {
			const indent = m[1].length;
			if (!minIndent) {
				// this is the first indented line
				minIndent = indent;
			} else {
				minIndent = Math.min(minIndent, indent);
			}
		}
	});

	if (minIndent !== null) {
		result = lines
			.map(function (l) {
				return l[0] === " " || l[0] === "\t" ? l.slice(minIndent) : l;
			})
			.join("\n");
	}

	return result.trim();
}

const toSpaces = (str: string) => str.replace(/\t/g, "  ");

function transformCode(code: string) {
	const result = transform(code, {
		plugins: [signalsTransform, "@babel/plugin-syntax-jsx"],
	});

	return result?.code || "";
}

function runTest(input: string, expected: string) {
	const output = transformCode(input);
	expect(toSpaces(dedent(output))).to.equal(toSpaces(dedent(expected)));
}

describe("React Signals Babel Transform", () => {
	it("wraps arrow function component with return statement in try/finally", () => {
		const inputCode = `
			const MyComponent = () => {
				return <div>Hello World</div>;
			};
		`;

		const expectedOutput = `
			const MyComponent = () => {
			try {
				return <div>Hello World</div>;
			} finally {}
			};
		`;

		runTest(inputCode, expectedOutput);
	});

	it("wraps arrow function component with inline return in try/finally", () => {
		const inputCode = `
			const MyComponent = () => <div>Hello World</div>;
		`;

		const expectedOutput = `
			const MyComponent = () => {
			try {
				return <div>Hello World</div>;
			} finally {}
			};
		`;

		runTest(inputCode, expectedOutput);
	});

	it("wraps function declarations with try/finally", () => {
		const inputCode = `
			function MyComponent() {
				return <div>Hello World</div>;
			}
		`;

		const expectedOutput = `
			function MyComponent() {
			try {
				return <div>Hello World</div>;
			} finally {}
			}
		`;

		runTest(inputCode, expectedOutput);
	});
});
