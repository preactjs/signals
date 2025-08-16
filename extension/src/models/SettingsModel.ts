import { signal, effect } from "@preact/signals";
import { Settings } from "../types";

const createSettingsModel = () => {
	const settings = signal<Settings>({
		enabled: true,
		grouped: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});

	const showSettings = signal<boolean>(false);

	const applySettings = (newSettings: Settings) => {
		settings.value = newSettings;
		window.postMessage(
			{
				type: "CONFIGURE_DEBUG",
				payload: newSettings,
			},
			"*"
		);
		showSettings.value = false;
	};

	const toggleSettings = () => {
		showSettings.value = !showSettings.value;
	};

	const hideSettings = () => {
		showSettings.value = false;
	};

	effect(() => {
		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) return;

			const { type, payload } = event.data;

			switch (type) {
				case "SIGNALS_CONFIG":
					settings.value = payload.settings;
					break;
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	});

	return {
		get settings() {
			return settings.value;
		},
		get showSettings() {
			return showSettings.value;
		},
		// Actions
		set settings(newSettings: Settings) {
			settings.value = newSettings;
		},
		applySettings,
		toggleSettings,
		hideSettings,
	};
};

export const settingsStore = createSettingsModel();
