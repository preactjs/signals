import { effect, signal, createModel } from "@preact/signals";
import type {
	DevToolsAdapter,
	Settings,
} from "@preact/signals-devtools-adapter";

export const SettingsModel = createModel((adapter: DevToolsAdapter) => {
	const settings = signal<Settings>({
		enabled: true,
		grouped: true,
		consoleLogging: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});

	const showDisposedSignals = signal<boolean>(false);

	const applySettings = (newSettings: Settings) => {
		settings.value = newSettings;
		adapter.sendConfig(newSettings);
	};

	const toggleShowDisposedSignals = () => {
		showDisposedSignals.value = !showDisposedSignals.value;
	};

	effect(() => {
		const unsubscribe = adapter.on("configReceived", config => {
			settings.value = config.settings;
		});

		return () => {
			unsubscribe();
		};
	});

	return {
		settings,
		showDisposedSignals,
		applySettings,
		toggleShowDisposedSignals,
	};
});
