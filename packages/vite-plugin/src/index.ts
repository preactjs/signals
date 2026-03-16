import type { Plugin, ResolvedConfig } from "vite";
import { createSignalsAgentStore } from "./store";
import { createClientModuleCode } from "./client-module";
import { createSignalsAgentMiddleware } from "./server";
import {
	runSignalsTransform,
	shouldRunSignalsTransform,
	stripQuery,
	type SignalsTransformFramework,
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
	endpointBase?: string | false;
	maxEvents?: number;
	autoImportDebug?: boolean;
	autoTransform?: boolean;
	framework?: SignalsTransformFramework;
}

export function signalsVite(options: SignalsViteOptions = {}): Plugin {
	const endpointBase = normalizeEndpointBase(options.endpointBase);
	const hasDebugEndpoint = endpointBase !== false;
	const store = createSignalsAgentStore({ maxEvents: options.maxEvents });
	const serverMiddleware = hasDebugEndpoint
		? createSignalsAgentMiddleware({ store, endpointBase })
		: null;
	let resolvedConfig: ResolvedConfig | null = null;

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
				return hasDebugEndpoint
					? createClientModuleCode({ endpointBase })
					: null;
			}
			if (id === RESOLVED_VIRTUAL_ENTRY_MODULE_ID) {
				return createEntryModuleCode({
					autoImportDebug: options.autoImportDebug !== false,
					installClient: hasDebugEndpoint,
				});
			}
			return null;
		},
		async transform(code, id) {
			const framework = options.framework;

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
			if (
				isProductionBuild() ||
				(options.autoImportDebug === false && !hasDebugEndpoint)
			) {
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
			if (!serverMiddleware) {
				return;
			}

			server.middlewares.use(serverMiddleware);
		},
		configurePreviewServer(server) {
			if (!serverMiddleware) {
				return;
			}

			server.middlewares.use(serverMiddleware);
		},
	};
}

function normalizeEndpointBase(
	endpointBase: string | false = "/__signals_agent__"
): string | false {
	if (endpointBase === false) {
		return false;
	}

	if (endpointBase.trim() === "" || /^\/+$/u.test(endpointBase.trim())) {
		return "/";
	}

	const normalized = endpointBase.startsWith("/")
		? endpointBase
		: `/${endpointBase}`;
	return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
