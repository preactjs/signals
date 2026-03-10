// @ts-expect-error Babel types come from DefinitelyTyped in consumers
import { transformAsync } from "@babel/core";
import preactSignalsTransform from "@preact/signals-preact-transform";
import reactSignalsTransform from "@preact/signals-react-transform";
import type { ResolvedConfig } from "vite";

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

export function resolveTransformFramework({
	configuredFramework,
	config,
}: {
	configuredFramework: "auto" | SignalsTransformFramework;
	config: ResolvedConfig | null;
}): SignalsTransformFramework | null {
	if (configuredFramework !== "auto") {
		return configuredFramework;
	}

	const esbuildOptions =
		config?.esbuild && typeof config.esbuild === "object"
			? config.esbuild
			: null;
	if (esbuildOptions?.jsxImportSource === "preact") {
		return "preact";
	}
	if (esbuildOptions?.jsxImportSource === "react") {
		return "react";
	}

	const pluginNames =
		config?.plugins.map(plugin => plugin.name.toLowerCase()) ?? [];
	if (pluginNames.some(name => name.includes("preact"))) {
		return "preact";
	}
	if (pluginNames.some(name => name.includes("react"))) {
		return "react";
	}

	return null;
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
	const signalsTransform =
		framework === "react" ? reactSignalsTransform : preactSignalsTransform;
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
