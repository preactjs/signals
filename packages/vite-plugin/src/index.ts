import type { Plugin, ResolvedConfig } from "vite";
import { createSignalsAgentStore } from "./store";
import { createClientModuleCode } from "./client-module";
import { handleRequest, InvalidJsonBodyError, sendJson } from "./server";
import {
	resolveTransformFramework,
	runSignalsTransform,
	shouldRunSignalsTransform,
	stripQuery,
} from "./signals-transform";
import {
	createEntryModuleCode,
	RESOLVED_VIRTUAL_ENTRY_MODULE_ID,
	RESOLVED_VIRTUAL_MODULE_ID,
	toViteModuleUrl,
	VIRTUAL_ENTRY_MODULE_ID,
	VIRTUAL_MODULE_ID,
} from "./virtual-modules";

export interface SignalsViteOptions {
	endpointBase?: string;
	maxEvents?: number;
	autoImportDebug?: boolean;
	autoTransform?: boolean;
	framework?: "auto" | "react" | "preact";
}

export function signalsVite(options: SignalsViteOptions = {}): Plugin {
	const endpointBase = normalizeEndpointBase(options.endpointBase);
	const store = createSignalsAgentStore({ maxEvents: options.maxEvents });
	let resolvedConfig: ResolvedConfig | null = null;
	const clientOptions = {
		endpointBase,
	};

	const isProductionBuild = () =>
		resolvedConfig?.isProduction ?? resolvedConfig?.command === "build";

	return {
		name: "signals-vite",
		configResolved(config) {
			resolvedConfig = config;
		},
		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
			if (id === VIRTUAL_ENTRY_MODULE_ID) {
				return RESOLVED_VIRTUAL_ENTRY_MODULE_ID;
			}
			return null;
		},
		load(id) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				return createClientModuleCode(clientOptions);
			}
			if (id === RESOLVED_VIRTUAL_ENTRY_MODULE_ID) {
				return createEntryModuleCode({
					autoImportDebug: options.autoImportDebug !== false,
				});
			}
			return null;
		},
		async transform(code, id) {
			const framework = resolveTransformFramework({
				configuredFramework: options.framework ?? "auto",
				config: resolvedConfig,
			});

			if (
				!framework ||
				options.autoTransform === false ||
				(framework === "preact" && isProductionBuild())
			) {
				return null;
			}

			const cleanId = stripQuery(id);
			if (!shouldRunSignalsTransform(cleanId)) {
				return null;
			}

			return runSignalsTransform({
				code,
				id: cleanId,
				framework,
				debug: !isProductionBuild(),
			});
		},
		transformIndexHtml() {
			if (isProductionBuild()) {
				return undefined;
			}

			return [
				{
					tag: "script",
					attrs: {
						type: "module",
						src: toViteModuleUrl(RESOLVED_VIRTUAL_ENTRY_MODULE_ID),
					},
					injectTo: "head-prepend",
				},
			];
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				handleRequest({
					store,
					endpointBase,
					req,
					res,
					next,
				}).catch(error => {
					const statusCode = error instanceof InvalidJsonBodyError ? 400 : 500;
					sendJson(res, statusCode, {
						error: error instanceof Error ? error.message : "Unexpected error",
					});
				});
			});
		},
	};
}

function normalizeEndpointBase(endpointBase = "/__signals_agent__"): string {
	if (endpointBase.trim() === "" || /^\/+$/u.test(endpointBase.trim())) {
		return "/";
	}

	const normalized = endpointBase.startsWith("/")
		? endpointBase
		: `/${endpointBase}`;
	return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
