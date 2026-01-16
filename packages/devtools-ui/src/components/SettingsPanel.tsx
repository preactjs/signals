import { useSignal, useSignalEffect } from "@preact/signals";
import { Button } from "./Button";
import type { Settings } from "@preact/signals-devtools-adapter";
import { getContext } from "../context";

export function SettingsPanel() {
	const { settingsStore } = getContext();

	const onCancel = settingsStore.hideSettings;
	const onApply = settingsStore.applySettings;
	const settings = settingsStore.settings;
	const isVisible = settingsStore.showSettings;

	const localSettings = useSignal<Settings>(settings);

	useSignalEffect(() => {
		localSettings.value = settingsStore.settings;
	});

	const handleApply = () => {
		onApply(localSettings.value);
	};

	if (!isVisible) {
		return null;
	}

	return (
		<div className="settings-panel">
			<div className="settings-content">
				<h3>Debug Configuration</h3>

				<div className="setting-group">
					<label>
						<input
							type="checkbox"
							checked={localSettings.value.enabled}
							onChange={e =>
								(localSettings.value = {
									...localSettings.value,
									enabled: (e.target as HTMLInputElement).checked,
								})
							}
						/>
						Enable debug updates
					</label>
				</div>

				<div className="setting-group">
					<label>
						<input
							type="checkbox"
							checked={localSettings.value.grouped}
							onChange={e =>
								(localSettings.value = {
									...localSettings.value,
									grouped: (e.target as HTMLInputElement).checked,
								})
							}
						/>
						Group related updates
					</label>
				</div>

				<div className="setting-group">
					<label htmlFor="maxUpdatesInput">Max updates per second:</label>
					<input
						type="number"
						id="maxUpdatesInput"
						value={localSettings.value.maxUpdatesPerSecond}
						min="1"
						max="1000"
						onChange={e =>
							(localSettings.value = {
								...localSettings.value,
								maxUpdatesPerSecond:
									parseInt((e.target as HTMLInputElement).value) || 60,
							})
						}
					/>
				</div>

				<div className="setting-group">
					<label htmlFor="filterPatternsInput">
						Filter patterns (one per line):
					</label>
					<textarea
						id="filterPatternsInput"
						placeholder="user.*&#10;.*State$&#10;global"
						value={localSettings.value.filterPatterns.join("\n")}
						onChange={e =>
							(localSettings.value = {
								...localSettings.value,
								filterPatterns: (e.target as HTMLTextAreaElement).value
									.split("\n")
									.map(pattern => pattern.trim())
									.filter(pattern => pattern.length > 0),
							})
						}
					/>
				</div>

				<div className="settings-actions">
					<Button onClick={handleApply} variant="primary">
						Apply
					</Button>
					<Button onClick={onCancel}>Cancel</Button>
				</div>
			</div>
		</div>
	);
}
