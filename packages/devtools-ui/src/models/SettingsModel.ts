import { signal, createModel } from "@preact/signals";
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

	// Listen to adapter events
	adapter.on("configReceived", (config: { settings?: Settings }) => {
		if (config.settings) {
			settings.value = config.settings;
		}
	});

	return {
		settings,
		showDisposedSignals,
		applySettings,
		toggleShowDisposedSignals,
	};
});
