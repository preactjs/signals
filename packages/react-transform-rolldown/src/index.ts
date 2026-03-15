/* oxlint-disable */
// @ts-nocheck

import { withMagicString } from "rolldown-string";
import type { Plugin } from "rolldown";
import { parseSync } from "rolldown/utils";
import type { ESTree } from "rolldown/utils";
import type { ReactSignalsTransformPluginOptions } from "./types.ts";

export type { ReactSignalsTransformPluginOptions } from "./types.ts";

const optOutCommentIdentifier = /(^|\s)@no(Use|Track)Signals(\s|$)/;
const optInCommentIdentifier = /(^|\s)@(use|track)Signals(\s|$)/;
const defaultImportSource = "@preact/signals-react/runtime";
const defaultHookIdentifier = "_useSignals";
const effectIdentifier = "_effect";

const UNMANAGED = "0";
const MANAGED_COMPONENT = "1";
const MANAGED_HOOK = "2";

const signalCallNames = new Set([
	"signal",
	"computed",
	"useSignal",
	"useComputed",
]);

const jsxPackages = {
	"react/jsx-runtime": ["jsx", "jsxs"],
	"react/jsx-dev-runtime": ["jsxDEV"],
	react: ["createElement"],
};

type FunctionLike =
	| ESTree.FunctionDeclaration
	| ESTree.FunctionExpression
	| ESTree.ArrowFunctionExpression;

interface FunctionInfo {
	node: FunctionLike;
	name: string | null;
	containsJSX: boolean;
	maybeUsesSignal: boolean;
}

function basename(filename: string | undefined): string | undefined {
	return filename?.split(/[\\/]/).pop();
}

function looksLikeJSX(code: string): boolean {
	return /<>|<\/[A-Za-z]|<[A-Za-z]/.test(code);
}

function getParseOptions(id: string, code: string) {
	const cleanId = id.replace(/\?.*$/, "");
	const isCommonJS =
		/(^|\W)require\s*\(|(^|\W)module\.exports\b|(^|\W)exports\./.test(code);

	let lang: "js" | "jsx" | "ts" | "tsx" = "js";
	if (cleanId.endsWith(".tsx")) {
		lang = "tsx";
	} else if (
		cleanId.endsWith(".ts") ||
		cleanId.endsWith(".mts") ||
		cleanId.endsWith(".cts")
	) {
		lang = looksLikeJSX(code) ? "tsx" : "ts";
	} else if (cleanId.endsWith(".jsx")) {
		lang = "jsx";
	} else if (looksLikeJSX(code)) {
		lang = "jsx";
	}

	return {
		isCommonJS,
		lang,
		sourceType: isCommonJS ? "commonjs" : "module",
	};
}

function isNode(value: unknown): value is ESTree.Node {
	return (
		value != null &&
		typeof value === "object" &&
		typeof Reflect.get(value, "type") === "string" &&
		typeof Reflect.get(value, "start") === "number" &&
		typeof Reflect.get(value, "end") === "number"
	);
}

function walkNode(
	node: ESTree.Node,
	parent: ESTree.Node | null,
	visit: (node: ESTree.Node, parent: ESTree.Node | null) => void
): void {
	visit(node, parent);

	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isNode(item)) {
					walkNode(item, node, visit);
				}
			}
		} else if (isNode(value)) {
			walkNode(value, node, visit);
		}
	}
}

function isFunctionLike(node: ESTree.Node): node is FunctionLike {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

function getObjectPropertyKey(node: ESTree.Property): string | null {
	if (node.key.type === "Identifier") {
		return node.key.name;
	}

	if (node.key.type === "Literal" && typeof node.key.value === "string") {
		return node.key.value;
	}

	return null;
}

function getFunctionNodeName(node: FunctionLike): string | null {
	if (
		(node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression") &&
		node.id != null
	) {
		return node.id.name;
	}

	return null;
}

function getAssignmentTargetName(
	node: ESTree.AssignmentExpression
): string | null {
	if (node.left.type === "Identifier") {
		return node.left.name;
	}

	if (node.left.type !== "MemberExpression") {
		return null;
	}

	const property = node.left.property;
	if (!node.left.computed && property.type === "Identifier") {
		return property.name;
	}

	if (property.type === "Literal" && typeof property.value === "string") {
		return property.value;
	}

	return null;
}

function getFunctionNameFromParent(
	node: ESTree.Node | null | undefined,
	parentMap: Map<ESTree.Node, ESTree.Node | null>,
	filename: string | undefined
): string | null {
	if (node == null) {
		return null;
	}

	if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
		return node.id.name;
	}

	if (node.type === "AssignmentExpression") {
		return getAssignmentTargetName(node);
	}

	if (node.type === "Property") {
		return getObjectPropertyKey(node);
	}

	if (node.type === "ExportDefaultDeclaration") {
		return basename(filename) ?? null;
	}

	if (node.type === "CallExpression") {
		return getFunctionNameFromParent(parentMap.get(node), parentMap, filename);
	}

	if (node.type === "ParenthesizedExpression") {
		return getFunctionNameFromParent(parentMap.get(node), parentMap, filename);
	}

	return null;
}

function getFunctionName(
	node: FunctionLike,
	parentMap: Map<ESTree.Node, ESTree.Node | null>,
	filename: string | undefined
): string | null {
	return (
		getFunctionNodeName(node) ??
		getFunctionNameFromParent(parentMap.get(node), parentMap, filename)
	);
}

function isComponentName(name: string | null): boolean {
	return name != null && /^[A-Z]/.test(name);
}

function isCustomHookName(name: string | null): boolean {
	return name != null && /^use[A-Z]/.test(name);
}

function isHookCallbackFunction(
	node: FunctionLike,
	parentMap: Map<ESTree.Node, ESTree.Node | null>
): boolean {
	const parent = parentMap.get(node);
	return (
		parent?.type === "CallExpression" &&
		parent.callee.type === "Identifier" &&
		isCustomHookName(parent.callee.name)
	);
}

function findParentComponentOrHook(
	node: ESTree.Node,
	parentMap: Map<ESTree.Node, ESTree.Node | null>,
	functionInfoMap: Map<FunctionLike, FunctionInfo>
): FunctionInfo | null {
	let current = parentMap.get(node);

	while (current != null) {
		if (isFunctionLike(current)) {
			const info = functionInfoMap.get(current);
			if (info == null) {
				return null;
			}

			if (isComponentName(info.name) || isCustomHookName(info.name)) {
				return info;
			}

			if (isHookCallbackFunction(current, parentMap)) {
				return null;
			}
		}

		current = parentMap.get(current);
	}

	return null;
}

function hasLeadingComment(
	node: ESTree.Node,
	comments: ESTree.Comment[],
	code: string,
	matcher: RegExp
): boolean {
	return comments.some(comment => {
		if (comment.end > node.start) {
			return false;
		}

		const between = code.slice(comment.end, node.start);
		return /^\s*$/.test(between) && matcher.test(comment.value);
	});
}

function isOptedIntoSignalTracking(
	node: ESTree.Node | null | undefined,
	comments: ESTree.Comment[],
	code: string,
	parentMap: Map<ESTree.Node, ESTree.Node | null>
): boolean {
	if (node == null) {
		return false;
	}

	switch (node.type) {
		case "ArrowFunctionExpression":
		case "FunctionExpression":
		case "FunctionDeclaration":
		case "ObjectExpression":
		case "VariableDeclarator":
		case "VariableDeclaration":
		case "AssignmentExpression":
		case "CallExpression":
		case "ParenthesizedExpression":
			return (
				hasLeadingComment(node, comments, code, optInCommentIdentifier) ||
				isOptedIntoSignalTracking(
					parentMap.get(node),
					comments,
					code,
					parentMap
				)
			);

		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
		case "Property":
		case "ExpressionStatement":
			return hasLeadingComment(node, comments, code, optInCommentIdentifier);

		default:
			return false;
	}
}

function isOptedOutOfSignalTracking(
	node: ESTree.Node | null | undefined,
	comments: ESTree.Comment[],
	code: string,
	parentMap: Map<ESTree.Node, ESTree.Node | null>
): boolean {
	if (node == null) {
		return false;
	}

	switch (node.type) {
		case "ArrowFunctionExpression":
		case "FunctionExpression":
		case "FunctionDeclaration":
		case "ObjectExpression":
		case "VariableDeclarator":
		case "VariableDeclaration":
		case "AssignmentExpression":
		case "CallExpression":
		case "ParenthesizedExpression":
			return (
				hasLeadingComment(node, comments, code, optOutCommentIdentifier) ||
				isOptedOutOfSignalTracking(
					parentMap.get(node),
					comments,
					code,
					parentMap
				)
			);

		case "ExportDefaultDeclaration":
		case "ExportNamedDeclaration":
		case "Property":
		case "ExpressionStatement":
			return hasLeadingComment(node, comments, code, optOutCommentIdentifier);

		default:
			return false;
	}
}

function shouldTransform(
	info: FunctionInfo,
	options: ReactSignalsTransformPluginOptions,
	comments: ESTree.Comment[],
	code: string,
	parentMap: Map<ESTree.Node, ESTree.Node | null>
): boolean {
	const isComponentFunction = info.containsJSX && isComponentName(info.name);

	if (isOptedOutOfSignalTracking(info.node, comments, code, parentMap)) {
		return false;
	}

	if (isOptedIntoSignalTracking(info.node, comments, code, parentMap)) {
		return true;
	}

	if (options.mode === "all") {
		return isComponentFunction;
	}

	if (options.mode == null || options.mode === "auto") {
		return (
			info.maybeUsesSignal &&
			(isComponentFunction || isCustomHookName(info.name))
		);
	}

	return false;
}

function isValueMemberExpression(node: ESTree.MemberExpression): boolean {
	if (!node.computed && node.property.type === "Identifier") {
		return node.property.name === "value";
	}

	return node.property.type === "Literal" && node.property.value === "value";
}

function hasValuePropertyInPattern(node: ESTree.ObjectPattern): boolean {
	return node.properties.some(property => {
		if (property.type !== "Property") {
			return false;
		}

		return property.key.type === "Identifier" && property.key.name === "value";
	});
}

function isRequireCall(
	node: ESTree.Node | null | undefined,
	source: string
): boolean {
	return (
		node?.type === "CallExpression" &&
		node.callee.type === "Identifier" &&
		node.callee.name === "require" &&
		node.arguments[0]?.type === "Literal" &&
		node.arguments[0].value === source
	);
}

function collectJSXAlternativeImports(program: ESTree.Program) {
	const identifiers = new Set<string>();
	const objects = new Map<string, string[]>();

	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration") {
			const jsxMethods = jsxPackages[statement.source.value];
			if (jsxMethods == null) {
				continue;
			}

			for (const specifier of statement.specifiers) {
				if (specifier.type === "ImportSpecifier") {
					const importedName =
						specifier.imported.type === "Identifier"
							? specifier.imported.name
							: specifier.imported.value;

					if (jsxMethods.includes(importedName)) {
						identifiers.add(specifier.local.name);
					}
				} else if (
					specifier.type === "ImportDefaultSpecifier" ||
					specifier.type === "ImportNamespaceSpecifier"
				) {
					objects.set(specifier.local.name, jsxMethods);
				}
			}

			continue;
		}

		if (statement.type !== "VariableDeclaration") {
			continue;
		}

		for (const declarator of statement.declarations) {
			if (
				!isRequireCall(declarator.init, "react") &&
				!isRequireCall(declarator.init, "react/jsx-runtime") &&
				!isRequireCall(declarator.init, "react/jsx-dev-runtime")
			) {
				continue;
			}

			const source = declarator.init.arguments[0].value;
			const jsxMethods = jsxPackages[source];
			if (jsxMethods == null) {
				continue;
			}

			if (declarator.id.type === "Identifier") {
				objects.set(declarator.id.name, jsxMethods);
			} else if (declarator.id.type === "ObjectPattern") {
				for (const property of declarator.id.properties) {
					if (property.type !== "Property") {
						continue;
					}

					const importedName = getObjectPropertyKey(property);
					if (!jsxMethods.includes(importedName ?? "")) {
						continue;
					}

					if (property.value.type === "Identifier") {
						identifiers.add(property.value.name);
					}
				}
			}
		}
	}

	return { identifiers, objects };
}

function isJSXAlternativeCall(
	node: ESTree.CallExpression,
	jsxIdentifiers: Set<string>,
	jsxObjects: Map<string, string[]>
): boolean {
	const callee = node.callee;

	if (callee.type === "Identifier") {
		return jsxIdentifiers.has(callee.name);
	}

	if (
		callee.type !== "MemberExpression" ||
		callee.object.type !== "Identifier"
	) {
		return false;
	}

	const allowedMethods = jsxObjects.get(callee.object.name);
	if (allowedMethods == null) {
		return false;
	}

	if (!callee.computed && callee.property.type === "Identifier") {
		return allowedMethods.includes(callee.property.name);
	}

	return callee.property.type === "Literal" &&
		typeof callee.property.value === "string"
		? allowedMethods.includes(callee.property.value)
		: false;
}

function isSignalCall(node: ESTree.CallExpression): boolean {
	return (
		node.callee.type === "Identifier" && signalCallNames.has(node.callee.name)
	);
}

function getVariableNameFromDeclarator(
	node: ESTree.Node,
	parentMap: Map<ESTree.Node, ESTree.Node | null>
): string | null {
	let current = node;

	while (current != null) {
		if (
			current.type === "VariableDeclarator" &&
			current.id.type === "Identifier"
		) {
			return current.id.name;
		}

		current = parentMap.get(current);
	}

	return null;
}

function hasNameInOptions(node: ESTree.CallExpression): boolean {
	if (node.arguments.length < 2) {
		return false;
	}

	const optionsArgument = node.arguments[1];
	if (optionsArgument.type !== "ObjectExpression") {
		return false;
	}

	return optionsArgument.properties.some(property => {
		if (property.type !== "Property") {
			return false;
		}

		if (property.key.type === "Identifier") {
			return property.key.name === "name";
		}

		return property.key.type === "Literal" && property.key.value === "name";
	});
}

function createLineLookup(code: string) {
	const lineStarts = [0];
	for (let index = 0; index < code.length; index++) {
		if (code[index] === "\n") {
			lineStarts.push(index + 1);
		}
	}

	return (offset: number): number => {
		let low = 0;
		let high = lineStarts.length - 1;

		while (low <= high) {
			const middle = Math.floor((low + high) / 2);
			const start = lineStarts[middle];
			const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;

			if (offset < start) {
				high = middle - 1;
			} else if (offset >= next) {
				low = middle + 1;
			} else {
				return middle + 1;
			}
		}

		return lineStarts.length;
	};
}

function hasTrailingComma(code: string, end: number): boolean {
	let index = end - 2;
	while (index >= 0 && /\s/.test(code[index])) {
		index--;
	}
	return code[index] === ",";
}

function createSignalNameLiteral(
	variableName: string,
	filename: string | undefined,
	lineOf: (offset: number) => number,
	offset: number
): string {
	if (filename == null) {
		return JSON.stringify(variableName);
	}

	const file = basename(filename);
	if (file == null) {
		return JSON.stringify(variableName);
	}

	return JSON.stringify(`${variableName} (${file}:${lineOf(offset)})`);
}

function injectSignalName(
	s: Parameters<ReturnType<typeof withMagicString>>[1] | any,
	code: string,
	node: ESTree.CallExpression,
	variableName: string,
	filename: string | undefined,
	lineOf: (offset: number) => number
): void {
	const nameLiteral = createSignalNameLiteral(
		variableName,
		filename,
		lineOf,
		node.start
	);
	const objectLiteral = `{\n  name: ${nameLiteral}\n}`;

	if (node.arguments.length === 0) {
		s.appendLeft(node.end - 1, `undefined, ${objectLiteral}`);
		return;
	}

	if (node.arguments.length === 1) {
		s.appendLeft(node.end - 1, `, ${objectLiteral}`);
		return;
	}

	const optionsArgument = node.arguments[1];
	if (optionsArgument.type === "ObjectExpression") {
		if (optionsArgument.properties.length === 0) {
			s.appendLeft(optionsArgument.end - 1, `name: ${nameLiteral}`);
			return;
		}

		const separator = hasTrailingComma(code, optionsArgument.end) ? " " : ", ";
		s.appendLeft(optionsArgument.end - 1, `${separator}name: ${nameLiteral}`);
		return;
	}

	s.update(optionsArgument.start, optionsArgument.end, objectLiteral);
}

function extractBindingNames(
	pattern: ESTree.ParamPattern | ESTree.BindingPattern,
	names: string[]
) {
	switch (pattern.type) {
		case "Identifier":
			names.push(pattern.name);
			break;

		case "ArrayPattern":
			for (const element of pattern.elements) {
				if (element != null) {
					extractBindingNames(element, names);
				}
			}
			break;

		case "ObjectPattern":
			for (const property of pattern.properties) {
				if (property.type === "RestElement") {
					extractBindingNames(property.argument, names);
				} else {
					extractBindingNames(property.value, names);
				}
			}
			break;

		case "AssignmentPattern":
			extractBindingNames(pattern.left, names);
			break;

		case "RestElement":
			extractBindingNames(pattern.argument, names);
			break;
	}
}

function collectTopLevelBindings(program: ESTree.Program): Set<string> {
	const names = new Set<string>();

	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration") {
			for (const specifier of statement.specifiers) {
				names.add(specifier.local.name);
			}
			continue;
		}

		if (statement.type === "VariableDeclaration") {
			for (const declaration of statement.declarations) {
				const declarationNames: string[] = [];
				extractBindingNames(declaration.id, declarationNames);
				for (const name of declarationNames) {
					names.add(name);
				}
			}
			continue;
		}

		if (
			(statement.type === "FunctionDeclaration" ||
				statement.type === "ClassDeclaration") &&
			statement.id
		) {
			names.add(statement.id.name);
		}
	}

	return names;
}

function createUniqueIdentifier(
	topLevelBindings: Set<string>,
	base: string
): string {
	if (!topLevelBindings.has(base)) {
		return base;
	}

	let index = 2;
	while (topLevelBindings.has(`${base}${index}`)) {
		index++;
	}
	return `${base}${index}`;
}

function findExistingHookBinding(
	program: ESTree.Program,
	importSource: string
): string | null {
	for (const statement of program.body) {
		if (
			statement.type === "ImportDeclaration" &&
			statement.source.value === importSource
		) {
			for (const specifier of statement.specifiers) {
				if (specifier.type !== "ImportSpecifier") {
					continue;
				}

				const importedName =
					specifier.imported.type === "Identifier"
						? specifier.imported.name
						: specifier.imported.value;

				if (importedName === "useSignals") {
					return specifier.local.name;
				}
			}
		}

		if (statement.type !== "VariableDeclaration") {
			continue;
		}

		for (const declaration of statement.declarations) {
			if (
				declaration.id.type === "Identifier" &&
				declaration.init?.type === "MemberExpression" &&
				declaration.init.object.type === "CallExpression" &&
				isRequireCall(declaration.init.object, importSource)
			) {
				const property = declaration.init.property;
				if (
					!declaration.init.computed &&
					property.type === "Identifier" &&
					property.name === "useSignals"
				) {
					return declaration.id.name;
				}
			}

			if (
				declaration.id.type !== "ObjectPattern" ||
				!isRequireCall(declaration.init, importSource)
			) {
				continue;
			}

			for (const property of declaration.id.properties) {
				if (property.type !== "Property") {
					continue;
				}

				if (getObjectPropertyKey(property) !== "useSignals") {
					continue;
				}

				if (property.value.type === "Identifier") {
					return property.value.name;
				}
			}
		}
	}

	return null;
}

function addHookImport(
	s: Parameters<ReturnType<typeof withMagicString>>[1] | any,
	program: ESTree.Program,
	importSource: string,
	hookIdentifier: string,
	isCommonJS: boolean
): void {
	if (isCommonJS) {
		s.prepend(
			`var ${hookIdentifier} = require(${JSON.stringify(importSource)}).useSignals\n`
		);
		return;
	}

	const importLine = `import { useSignals as ${hookIdentifier} } from ${JSON.stringify(importSource)};\n`;
	let lastImport: ESTree.ImportDeclaration | null = null;

	for (const statement of program.body) {
		if (statement.type === "ImportDeclaration") {
			lastImport = statement;
		}
	}

	if (lastImport != null) {
		s.appendLeft(lastImport.end, `\n${importLine}`);
	} else {
		const leadingWhitespace = s.original.slice(0, program.start);
		if (program.start > 0 && /^\s*$/.test(leadingWhitespace)) {
			s.update(0, program.start, importLine);
		} else {
			s.prepend(importLine);
		}
	}
}

function createUseSignalsCall(
	hookIdentifier: string,
	usage: string | null,
	options: ReactSignalsTransformPluginOptions,
	functionName: string | null
): string {
	const args: string[] = [];

	if (usage != null) {
		args.push(usage);
	} else if (options.experimental?.debug && functionName) {
		args.push("undefined");
	}

	if (options.experimental?.debug && functionName) {
		args.push(JSON.stringify(functionName));
	}

	return `${hookIdentifier}(${args.join(", ")})`;
}

function transformFunction(
	s: Parameters<ReturnType<typeof withMagicString>>[1] | any,
	info: FunctionInfo,
	hookIdentifier: string,
	options: ReactSignalsTransformPluginOptions
): void {
	const isHook = isCustomHookName(info.name);
	const isComponent = isComponentName(info.name);
	const hookUsage = options.experimental?.noTryFinally
		? UNMANAGED
		: isHook
			? MANAGED_HOOK
			: isComponent
				? MANAGED_COMPONENT
				: UNMANAGED;

	const body = info.node.body;

	if (hookUsage === UNMANAGED) {
		const hookCall = createUseSignalsCall(
			hookIdentifier,
			null,
			options,
			info.name
		);

		if (body.type === "BlockStatement") {
			s.appendLeft(body.start + 1, `\n${hookCall};`);
			return;
		}

		s.appendLeft(body.start, `{${hookCall};\nreturn `);
		s.appendLeft(body.end, "\n}");
		return;
	}

	const hookCall = createUseSignalsCall(
		hookIdentifier,
		hookUsage,
		options,
		info.name
	);
	if (body.type === "BlockStatement") {
		s.appendLeft(
			body.start + 1,
			`\nvar ${effectIdentifier} = ${hookCall};\ntry {`
		);
		s.appendLeft(body.end - 1, `\n} finally {\n${effectIdentifier}.f();\n}`);
		return;
	}

	s.appendLeft(
		body.start,
		`{var ${effectIdentifier} = ${hookCall};\ntry {\nreturn `
	);
	s.appendLeft(body.end, `;\n} finally {\n${effectIdentifier}.f();\n}\n}`);
}

export default function reactSignalsTransform(
	options: ReactSignalsTransformPluginOptions = {}
): Plugin {
	return {
		name: "@preact/signals-react-transform-rolldown",
		// @ts-expect-error Vite-specific property
		enforce: "pre",
		transform: {
			filter: {
				id: /\.[cm]?[jt]sx?(?:$|\?)/,
			},
			handler: withMagicString(function (s, id) {
				const parseOptions = getParseOptions(id, s.original);
				const parsed = parseSync(id, s.original, {
					lang: parseOptions.lang,
					sourceType: parseOptions.sourceType,
				});
				const program = parsed.program;
				const comments = parsed.comments ?? [];
				const parentMap = new Map<ESTree.Node, ESTree.Node | null>();
				const functionInfoMap = new Map<FunctionLike, FunctionInfo>();
				const signalCallsToName: Array<{
					node: ESTree.CallExpression;
					variableName: string;
				}> = [];
				const lineOf = createLineLookup(s.original);

				walkNode(program, null, (node, parent) => {
					parentMap.set(node, parent);

					if (isFunctionLike(node)) {
						functionInfoMap.set(node, {
							node,
							name: null,
							containsJSX: false,
							maybeUsesSignal: false,
						});
					}
				});

				for (const info of functionInfoMap.values()) {
					info.name = getFunctionName(info.node, parentMap, id);
				}

				const jsxAlternatives = options.detectTransformedJSX
					? collectJSXAlternativeImports(program)
					: null;

				walkNode(program, null, node => {
					if (node.type === "CallExpression") {
						if (
							jsxAlternatives != null &&
							isJSXAlternativeCall(
								node,
								jsxAlternatives.identifiers,
								jsxAlternatives.objects
							)
						) {
							const info = findParentComponentOrHook(
								node,
								parentMap,
								functionInfoMap
							);
							if (info != null) {
								info.containsJSX = true;
							}
						}

						if (
							options.experimental?.debug &&
							isSignalCall(node) &&
							!hasNameInOptions(node)
						) {
							const variableName = getVariableNameFromDeclarator(
								node,
								parentMap
							);
							if (variableName != null) {
								signalCallsToName.push({ node, variableName });
							}
						}
					}

					if (
						node.type === "MemberExpression" &&
						isValueMemberExpression(node)
					) {
						const info = findParentComponentOrHook(
							node,
							parentMap,
							functionInfoMap
						);
						if (info != null) {
							info.maybeUsesSignal = true;
						}
					}

					if (
						node.type === "ObjectPattern" &&
						hasValuePropertyInPattern(node)
					) {
						const info = findParentComponentOrHook(
							node,
							parentMap,
							functionInfoMap
						);
						if (info != null) {
							info.maybeUsesSignal = true;
						}
					}

					if (node.type === "JSXElement" || node.type === "JSXFragment") {
						const info = findParentComponentOrHook(
							node,
							parentMap,
							functionInfoMap
						);
						if (info != null) {
							info.containsJSX = true;
						}
					}
				});

				const functionsToTransform = Array.from(
					functionInfoMap.values()
				).filter(info =>
					shouldTransform(info, options, comments, s.original, parentMap)
				);

				if (
					functionsToTransform.length === 0 &&
					signalCallsToName.length === 0
				) {
					return;
				}

				for (const { node, variableName } of signalCallsToName) {
					injectSignalName(s, s.original, node, variableName, id, lineOf);
				}

				let hookIdentifier = findExistingHookBinding(
					program,
					options.importSource ?? defaultImportSource
				);
				if (functionsToTransform.length > 0 && hookIdentifier == null) {
					hookIdentifier = createUniqueIdentifier(
						collectTopLevelBindings(program),
						defaultHookIdentifier
					);
					addHookImport(
						s,
						program,
						options.importSource ?? defaultImportSource,
						hookIdentifier,
						parseOptions.isCommonJS
					);
				}

				if (hookIdentifier == null) {
					return;
				}

				for (const info of functionsToTransform) {
					transformFunction(s, info, hookIdentifier, options);
				}
			}),
		},
	};
}
