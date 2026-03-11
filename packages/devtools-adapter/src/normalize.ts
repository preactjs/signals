import type { DebugConfig, Settings } from "./types";

function isSettings(value: unknown): value is Settings {
	if (!value || typeof value !== "object") {
		return false;
	}

	const settings = value as Partial<Settings>;
	return (
		typeof settings.enabled === "boolean" &&
		typeof settings.grouped === "boolean" &&
		typeof settings.consoleLogging === "boolean" &&
		typeof settings.maxUpdatesPerSecond === "number" &&
		Array.isArray(settings.filterPatterns) &&
		settings.filterPatterns.every(pattern => typeof pattern === "string")
	);
}

export function normalizeDebugConfig(payload: unknown): DebugConfig | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const config = payload as { settings?: unknown };
	if (isSettings(config.settings)) {
		return { settings: config.settings };
	}

	if (isSettings(payload)) {
		return { settings: payload };
	}

	return null;
}
