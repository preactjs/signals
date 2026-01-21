import { StatusIndicator } from "./StatusIndicator";
import { Button } from "./Button";
import { getContext } from "../context";

export function Header() {
	const { connectionStore, updatesStore } = getContext();

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
				<Button popovertarget="settings-panel-popover">Settings</Button>
			</div>
		</header>
	);
}
