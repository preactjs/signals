import { StatusIndicator } from "./StatusIndicator";
import { Button } from "./Button";
import { connectionStore } from "../models/ConnectionModel";
import { updatesStore } from "../models/UpdatesModel";

interface HeaderProps {
	onToggleSettings?: () => void;
}

export function Header({ onToggleSettings }: HeaderProps) {
	const onTogglePause = () => {
		connectionStore.isPaused = !connectionStore.isPaused;
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
					<Button onClick={onTogglePause} active={connectionStore.isPaused}>
						{connectionStore.isPaused ? "Resume" : "Pause"}
					</Button>
				)}
				{onToggleSettings && (
					<Button onClick={onToggleSettings}>Settings</Button>
				)}
			</div>
		</header>
	);
}
