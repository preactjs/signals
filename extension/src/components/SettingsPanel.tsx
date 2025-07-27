import { useState, useEffect } from "preact/hooks";
import { Button } from "./Button";
import { Settings } from "../types";

interface SettingsPanelProps {
	isVisible: boolean;
	settings: Settings;
	onApply: (settings: Settings) => void;
	onCancel: () => void;
}

export function SettingsPanel({
	isVisible,
	settings,
	onApply,
	onCancel,
}: SettingsPanelProps) {
	const [localSettings, setLocalSettings] = useState<Settings>(settings);

	useEffect(() => {
		setLocalSettings(settings);
	}, [settings]);

	const handleApply = () => {
		onApply(localSettings);
	};

	if (!isVisible) return null;

	return (
		<div className="settings-panel">
			<div className="settings-content">
				<h3>Debug Configuration</h3>

				<div className="setting-group">
					<label>
						<input
							type="checkbox"
							checked={localSettings.enabled}
							onChange={e =>
								setLocalSettings({
									...localSettings,
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
							checked={localSettings.grouped}
							onChange={e =>
								setLocalSettings({
									...localSettings,
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
						value={localSettings.maxUpdatesPerSecond}
						min="1"
						max="1000"
						onChange={e =>
							setLocalSettings({
								...localSettings,
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
						value={localSettings.filterPatterns.join("\n")}
						onChange={e =>
							setLocalSettings({
								...localSettings,
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
