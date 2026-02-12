import { signal, computed, effect } from "@preact/signals";
import type { DevToolsAdapter } from "@preact/signals-devtools-adapter";
import { ConnectionModel } from "./models/ConnectionModel";
import { SettingsModel } from "./models/SettingsModel";
import { UpdatesModel } from "./models/UpdatesModel";

export { ConnectionModel, SettingsModel, UpdatesModel };
export type {
	SignalUpdate,
	Divider,
	UpdateTreeNode,
	UpdateTreeNodeSingle,
	UpdateTreeNodeGroup,
} from "./models/UpdatesModel";

export type ThemeMode = "auto" | "light" | "dark";

export interface DevToolsContext {
	adapter: DevToolsAdapter;
	connectionStore: InstanceType<typeof ConnectionModel>;
	updatesStore: InstanceType<typeof UpdatesModel>;
	settingsStore: InstanceType<typeof SettingsModel>;
	themeStore: ReturnType<typeof createThemeStore>;
}

let currentContext: DevToolsContext | null = null;

export function getContext(): DevToolsContext {
	if (!currentContext) {
		throw new Error(
			"DevTools context not initialized. Call initDevTools() first."
		);
	}
	return currentContext;
}

const THEME_STORAGE_KEY = "signals-devtools-theme";

export function createThemeStore() {
	const stored = (() => {
		try {
			const val = localStorage.getItem(THEME_STORAGE_KEY);
			if (val === "light" || val === "dark" || val === "auto") return val;
		} catch {
			// localStorage unavailable
		}
		return "auto" as ThemeMode;
	})();

	const theme = signal<ThemeMode>(stored);

	const mediaQuery =
		typeof window !== "undefined"
			? window.matchMedia("(prefers-color-scheme: dark)")
			: null;
	const systemIsDark = signal(mediaQuery?.matches ?? false);

	if (mediaQuery) {
		const handler = (e: MediaQueryListEvent) => {
			systemIsDark.value = e.matches;
		};
		mediaQuery.addEventListener("change", handler);
	}

	const resolvedTheme = computed<"light" | "dark">(() =>
		theme.value === "auto"
			? systemIsDark.value
				? "dark"
				: "light"
			: theme.value
	);

	// Apply data-theme attribute to the devtools container
	effect(() => {
		const resolved = resolvedTheme.value;
		const el = document.querySelector(".signals-devtools");
		if (el instanceof HTMLElement) {
			el.dataset.theme = resolved;
		}
	});

	const toggleTheme = () => {
		const order: ThemeMode[] = ["auto", "light", "dark"];
		const idx = order.indexOf(theme.value);
		theme.value = order[(idx + 1) % order.length];
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme.value);
		} catch {
			// localStorage unavailable
		}
	};

	return {
		get theme() {
			return theme.value;
		},
		get resolvedTheme() {
			return resolvedTheme.value;
		},
		toggleTheme,
	};
}

export function initDevTools(adapter: DevToolsAdapter): DevToolsContext {
	const settingsStore = new SettingsModel(adapter);
	const updatesStore = new UpdatesModel(adapter, settingsStore);
	const connectionStore = new ConnectionModel(adapter);
	const themeStore = createThemeStore();

	currentContext = {
		adapter,
		connectionStore,
		updatesStore,
		settingsStore,
		themeStore,
	};

	return currentContext;
}

export function destroyDevTools(): void {
	if (currentContext) {
		currentContext.connectionStore[Symbol.dispose]();
		currentContext.updatesStore[Symbol.dispose]();
		currentContext.settingsStore[Symbol.dispose]();
		currentContext.adapter.disconnect();
		currentContext = null;
	}
}
