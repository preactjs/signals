// @ts-expect-error Babel types come from DefinitelyTyped in consumers
import { transformAsync } from "@babel/core";

export type SignalsTransformFramework = "react" | "preact";

const TRANSFORM_FILE_RE = /\.[cm]?[jt]sx?$/;

export function stripQuery(id: string): string {
	return id.replace(/[?#].*$/, "");
}

export function shouldRunSignalsTransform(id: string): boolean {
	if (!TRANSFORM_FILE_RE.test(id)) {
		return false;
	}
	if (id.includes("/node_modules/") || id.includes("\\node_modules\\")) {
		return false;
	}
	return true;
}

export async function runSignalsTransform({
	code,
	id,
	framework,
	debug,
}: {
	code: string;
	id: string;
	framework: SignalsTransformFramework;
	debug: boolean;
}): Promise<{ code: string; map: any } | null> {
	const signalsTransform = await loadSignalsTransform(framework);
	const isTypeScript = /\.[cm]?tsx?$/.test(id);
	const result = await transformAsync(code, {
		filename: id,
		babelrc: false,
		configFile: false,
		sourceMaps: true,
		parserOpts: {
			sourceType: "module",
			plugins: isTypeScript ? ["jsx", "typescript"] : ["jsx"],
		},
		plugins: [
			[
				signalsTransform,
				framework === "react"
					? {
							mode: "auto",
							experimental: debug ? { debug: true } : undefined,
						}
					: { enabled: debug },
			],
		],
	});

	if (!result?.code || result.code === code) {
		return null;
	}

	return {
		code: result.code,
		map: result.map ?? null,
	};
}

async function loadSignalsTransform(framework: SignalsTransformFramework) {
	const packageName = getTransformPackageName(framework);

	try {
		const signalsTransformModule = await import(packageName);
		return signalsTransformModule.default ?? signalsTransformModule;
	} catch (error) {
		if (!isMissingModuleError(error, packageName)) {
			throw error;
		}

		throw new Error(
			`signalsVite() needs "${packageName}" installed to transform "${framework}" files. Add it as a devDependency or set autoTransform: false.`
		);
	}
}

function getTransformPackageName(framework: SignalsTransformFramework): string {
	return framework === "react"
		? "@preact/signals-react-transform"
		: "@preact/signals-preact-transform";
}

function isMissingModuleError(error: unknown, packageName: string): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const typedError = error as Error & { cause?: unknown; code?: string };
	const cause =
		typeof typedError.cause === "object" && typedError.cause !== null
			? typedError.cause
			: null;
	const causeCode =
		cause && "code" in cause && typeof cause.code === "string"
			? cause.code
			: null;
	const errorCode =
		typeof typedError.code === "string" ? typedError.code : null;

	return (
		error.message.includes(packageName) ||
		(cause instanceof Error && cause.message.includes(packageName)) ||
		errorCode === "ERR_MODULE_NOT_FOUND" ||
		causeCode === "ERR_MODULE_NOT_FOUND"
	);
}
