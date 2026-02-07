import { StatusIndicator } from "./StatusIndicator";
import { Button } from "./Button";
import { getContext } from "../context";
import type { ThemeMode } from "../context";

const themeLabels: Record<ThemeMode, string> = {
	auto: "Auto",
	light: "Light",
	dark: "Dark",
};

const themeIcons: Record<ThemeMode, string> = {
	auto: "\u25D1",
	light: "\u2600",
	dark: "\u263E",
};

export function Header() {
	const { connectionStore, updatesStore, themeStore } = getContext();

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
				<button
					className="theme-toggle"
					onClick={themeStore.toggleTheme}
					title={`Theme: ${themeLabels[themeStore.theme]}`}
				>
					{themeIcons[themeStore.theme]} {themeLabels[themeStore.theme]}
				</button>
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
