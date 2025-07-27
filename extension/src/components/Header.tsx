import { StatusIndicator } from "./StatusIndicator";
import { Button } from "./Button";
import { ConnectionStatus } from "../types";

interface HeaderProps {
	connectionStatus: ConnectionStatus;
	onClear?: () => void;
	onTogglePause?: () => void;
	onToggleSettings?: () => void;
	isPaused?: boolean;
	showControls?: boolean;
	title?: string;
	subtitle?: string;
}

export function Header({
	connectionStatus,
	onClear,
	onTogglePause,
	onToggleSettings,
	isPaused = false,
	showControls = true,
	title = "Preact Signals",
	subtitle,
}: HeaderProps) {
	return (
		<header className="header">
			<div className="header-title">
				<h1>{title}</h1>
				{subtitle && <p>{subtitle}</p>}
				<StatusIndicator
					status={connectionStatus.status}
					message={connectionStatus.message}
				/>
			</div>
			{showControls && (
				<div className="header-controls">
					{onClear && <Button onClick={onClear}>Clear</Button>}
					{onTogglePause && (
						<Button onClick={onTogglePause} active={isPaused}>
							{isPaused ? "Resume" : "Pause"}
						</Button>
					)}
					{onToggleSettings && (
						<Button onClick={onToggleSettings}>Settings</Button>
					)}
				</div>
			)}
		</header>
	);
}
