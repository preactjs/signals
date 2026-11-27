import { signal, computed, effect, createModel } from "@preact/signals";

export type ThemeMode = "auto" | "light" | "dark";

const THEME_STORAGE_KEY = "signals-devtools-theme";

export const ThemeModel = createModel(() => {
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

	effect(() => {
		if (!mediaQuery) return;

		const handler = (e: MediaQueryListEvent) => {
			systemIsDark.value = e.matches;
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	});

	const resolvedTheme = computed<"light" | "dark">(() =>
		theme.value === "auto"
			? systemIsDark.value
				? "dark"
				: "light"
			: theme.value
	);

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
		theme,
		resolvedTheme,
		toggleTheme,
	};
});
