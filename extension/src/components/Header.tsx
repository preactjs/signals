import { StatusIndicator } from "./StatusIndicator";
import { Button } from "./Button";
import { connectionStore } from "../models/ConnectionModel";
import { updatesStore } from "../models/UpdatesModel";
import { settingsStore } from "../models/SettingsModel";

export function Header() {
	const onToggleSettings = settingsStore.toggleSettings;
	const onTogglePause = () => {
		updatesStore.isPaused.value = !updatesStore.isPaused.value;
	};

	const onClear = () => {
		updatesStore.clearUpdates();
	};

	return (
		<header className="header">
			<div className="header-title">
				<h1>Signals</h1>
				<StatusIndicator
					status={connectionStore.status}
					message={connectionStore.message}
				/>
			</div>
			<div className="header-controls">
				{onClear && <Button onClick={onClear}>Clear</Button>}
				{onTogglePause && (
					<Button onClick={onTogglePause} active={updatesStore.isPaused.value}>
						{updatesStore.isPaused.value ? "Resume" : "Pause"}
					</Button>
				)}
				{onToggleSettings && (
					<Button onClick={onToggleSettings}>Settings</Button>
				)}
			</div>
		</header>
	);
}
