import { render, h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";

// Types
interface SignalUpdate {
	type: "update" | "effect";
	signalName: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
}

interface Settings {
	enabled: boolean;
	grouped: boolean;
	maxUpdatesPerSecond: number;
	filterPatterns: string[];
}

interface ConnectionStatus {
	status: "connected" | "disconnected" | "connecting" | "warning";
	message: string;
}

// Header Component
function Header({
	connectionStatus,
	onClear,
	onTogglePause,
	onToggleSettings,
	isPaused,
}: {
	connectionStatus: ConnectionStatus;
	onClear: () => void;
	onTogglePause: () => void;
	onToggleSettings: () => void;
	isPaused: boolean;
}) {
	return (
		<header className="header">
			<div className="header-title">
				<h1>Preact Signals</h1>
				<div className={`connection-status ${connectionStatus.status}`}>
					<span
						className={`status-indicator ${connectionStatus.status}`}
					></span>
					<span className="status-text">{connectionStatus.message}</span>
				</div>
			</div>
			<div className="header-controls">
				<button onClick={onClear} className="btn btn-secondary">
					Clear
				</button>
				<button
					onClick={onTogglePause}
					className={`btn btn-secondary ${isPaused ? "active" : ""}`}
				>
					{isPaused ? "Resume" : "Pause"}
				</button>
				<button onClick={onToggleSettings} className="btn btn-secondary">
					Settings
				</button>
			</div>
		</header>
	);
}

// Settings Panel Component
function SettingsPanel({
	isVisible,
	settings,
	onApply,
	onCancel,
}: {
	isVisible: boolean;
	settings: Settings;
	onApply: (settings: Settings) => void;
	onCancel: () => void;
}) {
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
					<button onClick={handleApply} className="btn btn-primary">
						Apply
					</button>
					<button onClick={onCancel} className="btn btn-secondary">
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

// Empty State Component
function EmptyState({ onRefresh }: { onRefresh: () => void }) {
	return (
		<div className="empty-state">
			<div className="empty-state-content">
				<h2>No Signals Detected</h2>
				<p>
					Make sure your application is using @preact/signals-debug package.
				</p>
				<div className="empty-state-actions">
					<button onClick={onRefresh} className="btn btn-primary">
						Refresh Detection
					</button>
				</div>
			</div>
		</div>
	);
}

// Update Item Component
function UpdateItem({ update }: { update: SignalUpdate }) {
	const time = new Date(
		update.timestamp || update.receivedAt
	).toLocaleTimeString();
	const depth = "  ".repeat(update.depth || 0);

	const formatValue = (value: any): string => {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return `"${value}"`;
		if (typeof value === "function") return "function()";
		if (typeof value === "object") {
			try {
				return JSON.stringify(value, null, 0);
			} catch {
				return "[Object]";
			}
		}
		return String(value);
	};

	if (update.type === "effect") {
		return (
			<div className={`update-item ${update.type}`}>
				<div className="update-header">
					<span className="signal-name">
						{depth}↪️ {update.signalName}
					</span>
					<span className="update-time">{time}</span>
				</div>
				<div className="update-depth">
					Effect triggered at depth {update.depth}
				</div>
			</div>
		);
	}

	const prevValue = formatValue(update.prevValue);
	const newValue = formatValue(update.newValue);

	return (
		<div className={`update-item ${update.type}`}>
			<div className="update-header">
				<span className="signal-name">
					{depth}
					{update.depth === 0 ? "🎯" : "↪️"} {update.signalName}
				</span>
				<span className="update-time">{time}</span>
			</div>
			<div className="value-change">
				<span className="value-prev">{prevValue}</span>
				<span className="value-arrow">→</span>
				<span className="value-new">{newValue}</span>
			</div>
			{update.depth && update.depth > 0 && (
				<div className="update-depth">Triggered at depth {update.depth}</div>
			)}
		</div>
	);
}

// Updates Container Component
function UpdatesContainer({
	updates,
	signalCounts,
}: {
	updates: SignalUpdate[];
	signalCounts: Map<string, number>;
}) {
	const updatesListRef = useRef<HTMLDivElement>(null);
	const recentUpdates = updates.slice(-50).reverse();

	useEffect(() => {
		if (updatesListRef.current) {
			updatesListRef.current.scrollTop = 0;
		}
	}, [updates]);

	return (
		<div className="updates-container">
			<div className="updates-header">
				<div className="updates-stats">
					<span>
						Updates: <strong>{updates.length}</strong>
					</span>
					<span>
						Signals: <strong>{signalCounts.size}</strong>
					</span>
				</div>
			</div>

			<div className="updates-list" ref={updatesListRef}>
				{recentUpdates.map((update, index) => (
					<div key={`${update.receivedAt}-${index}`}>
						<UpdateItem update={update} />
						{index < recentUpdates.length - 1 && <div className="divider" />}
					</div>
				))}
			</div>
		</div>
	);
}

// Main Panel Component
function SignalsDevToolsPanel() {
	const [updates, setUpdates] = useState<SignalUpdate[]>([]);
	const [signalCounts, setSignalCounts] = useState<Map<string, number>>(
		new Map()
	);
	const [isPaused, setIsPaused] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
		status: "connecting",
		message: "Connecting...",
	});
	const [showSettings, setShowSettings] = useState(false);
	const [settings, setSettings] = useState<Settings>({
		enabled: true,
		grouped: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});
	const [showEmptyState, setShowEmptyState] = useState(true);
	const [isBackgroundConnected, setIsBackgroundConnected] = useState(false);
	const [isContentScriptConnected, setIsContentScriptConnected] =
		useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const sendMessage = (message: any) => {
		window.postMessage(message, "*");
	};

	const updateConnectionStatus = () => {
		let status: ConnectionStatus["status"], message: string;

		if (!isBackgroundConnected) {
			status = "disconnected";
			message = "Disconnected from background";
		} else if (!isContentScriptConnected) {
			status = "connecting";
			message = "Connecting to page...";
		} else if (!isConnected) {
			status = "warning";
			message = "No signals detected";
		} else {
			status = "connected";
			message = "Connected";
		}

		setConnectionStatus({ status, message });
	};

	const handleSignalsUpdate = (
		signalUpdates: SignalUpdate | SignalUpdate[]
	) => {
		if (isPaused) return;

		const updatesArray = Array.isArray(signalUpdates)
			? signalUpdates
			: [signalUpdates];

		setUpdates(prev => {
			const newUpdates = [...prev];
			updatesArray.forEach(update => {
				newUpdates.push({
					...update,
					receivedAt: Date.now(),
				});
			});
			return newUpdates;
		});

		setSignalCounts(prev => {
			const newCounts = new Map(prev);
			updatesArray.forEach(update => {
				const signalName = update.signalName || "Unknown";
				newCounts.set(signalName, (newCounts.get(signalName) || 0) + 1);
			});
			return newCounts;
		});

		setShowEmptyState(false);
	};

	const handleSignalsAvailability = (available: boolean) => {
		setIsConnected(available);
		setShowEmptyState(!available);
	};

	const clearUpdates = () => {
		setUpdates([]);
		setSignalCounts(new Map());
	};

	const togglePause = () => {
		setIsPaused(!isPaused);
	};

	const toggleSettings = () => {
		setShowSettings(!showSettings);
	};

	const applySettings = (newSettings: Settings) => {
		setSettings(newSettings);
		sendMessage({
			type: "CONFIGURE_DEBUG",
			payload: newSettings,
		});
		setShowSettings(false);
	};

	const refreshDetection = () => {
		setConnectionStatus({ status: "connecting", message: "Refreshing..." });
		sendMessage({ type: "REQUEST_STATE" });
	};

	useEffect(() => {
		updateConnectionStatus();
	}, [isBackgroundConnected, isContentScriptConnected, isConnected]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) {
				return;
			}

			const { type, payload } = event.data;

			console.log("Received message from background:", type, payload);

			switch (type) {
				case "SIGNALS_UPDATE":
					handleSignalsUpdate(payload.updates);
					break;

				case "SIGNALS_AVAILABILITY":
					handleSignalsAvailability(payload.available);
					break;

				case "SIGNALS_CONFIG":
					setSettings(prev => ({ ...prev, ...payload }));
					break;

				case "CONNECTION_LOST":
					setIsBackgroundConnected(false);
					setIsContentScriptConnected(false);
					break;

				case "DEVTOOLS_READY":
					setIsBackgroundConnected(true);
					setTimeout(() => {
						refreshDetection();
					}, 500);
					break;

				case "BACKGROUND_READY":
					setIsBackgroundConnected(true);
					setIsContentScriptConnected(payload.contentScriptConnected);
					break;

				case "CONTENT_SCRIPT_DISCONNECTED":
					setIsContentScriptConnected(false);
					break;

				default:
					console.log("Unhandled message type:", type);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [isPaused]);

	return (
		<div id="app">
			<Header
				connectionStatus={connectionStatus}
				onClear={clearUpdates}
				onTogglePause={togglePause}
				onToggleSettings={toggleSettings}
				isPaused={isPaused}
			/>

			<SettingsPanel
				isVisible={showSettings}
				settings={settings}
				onApply={applySettings}
				onCancel={() => setShowSettings(false)}
			/>

			<main className="main-content">
				{showEmptyState ? (
					<EmptyState onRefresh={refreshDetection} />
				) : (
					<UpdatesContainer updates={updates} signalCounts={signalCounts} />
				)}
			</main>
		</div>
	);
}

// Initialize the panel when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	const container = document.getElementById("app");
	if (container) {
		// Clear existing content since we're taking over with Preact
		container.innerHTML = "";
		render(<SignalsDevToolsPanel />, container);
	}
});
