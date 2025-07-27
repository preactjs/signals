import { render } from "preact";
import { useSignal, useSignalEffect } from "@preact/signals";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { SignalUpdate, Divider, ConnectionStatus, Settings } from "./types";
import { GraphVisualization } from "./components/Graph";
import { createUpdatesModel } from "./models/UpdatesModel";
import { UpdatesContainer } from "./components/UpdatesContainer";

const updatesStore = createUpdatesModel();

function SignalsDevToolsPanel() {
	const showSettings = useSignal(false);
	const activeTab = useSignal<"updates" | "graph">("updates");

	// TODO: model
	const connectionStatus = useSignal<ConnectionStatus>({
		status: "connecting",
		message: "Connecting...",
	});
	const isPaused = useSignal(false);
	const settings = useSignal<Settings>({
		enabled: true,
		grouped: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});
	const isBackgroundConnected = useSignal(false);
	const isContentScriptConnected = useSignal(false);
	const isConnected = useSignal(false);

	const sendMessage = (message: any) => {
		window.postMessage(message, "*");
	};

	const handleSignalsUpdate = (
		signalUpdates: SignalUpdate | SignalUpdate[]
	) => {
		const updatesArray: Array<SignalUpdate | Divider> = Array.isArray(
			signalUpdates
		)
			? signalUpdates
			: [signalUpdates];

		updatesArray.reverse();
		updatesArray.push({ type: "divider" });

		updatesStore.addUpdate(updatesArray);
	};

	const togglePause = () => {
		isPaused.value = !isPaused.value;
	};

	const toggleSettings = () => {
		showSettings.value = !showSettings.value;
	};

	const applySettings = (newSettings: Settings) => {
		settings.value = newSettings;
		sendMessage({
			type: "CONFIGURE_DEBUG",
			payload: newSettings,
		});
		showSettings.value = false;
	};

	const refreshDetection = () => {
		connectionStatus.value = { status: "connecting", message: "Refreshing..." };
		sendMessage({ type: "REQUEST_STATE" });
	};

	// TODO: computed
	useSignalEffect(() => {
		let status: ConnectionStatus["status"], message: string;

		if (!isBackgroundConnected.value) {
			status = "disconnected";
			message = "Disconnected from background";
		} else if (!isContentScriptConnected.value) {
			status = "connecting";
			message = "Connecting to page...";
		} else if (!isConnected.value) {
			status = "warning";
			message = "No signals detected";
		} else {
			status = "connected";
			message = "Connected";
		}

		connectionStatus.value = { status, message };
	});

	useSignalEffect(() => {
		if (isPaused.value) return;

		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) return;

			const { type, payload } = event.data;

			switch (type) {
				case "SIGNALS_UPDATE":
					handleSignalsUpdate(payload.updates);
					break;

				case "SIGNALS_AVAILABILITY":
					isConnected.value = payload.available;
					break;

				case "SIGNALS_CONFIG":
					settings.value = payload.settings;
					break;

				case "CONNECTION_LOST":
					isBackgroundConnected.value = false;
					isContentScriptConnected.value = false;
					break;

				case "DEVTOOLS_READY":
					isBackgroundConnected.value = true;
					setTimeout(() => {
						refreshDetection();
					}, 500);
					break;

				case "BACKGROUND_READY":
					isBackgroundConnected.value = true;
					isContentScriptConnected.value = payload;
					break;

				case "CONTENT_SCRIPT_DISCONNECTED":
					isContentScriptConnected.value = false;
					break;

				default:
					console.log("Unhandled message type:", type);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	});

	return (
		<div id="app">
			<Header
				connectionStatus={connectionStatus.value}
				onClear={() => updatesStore.clearUpdates()}
				onTogglePause={togglePause}
				onToggleSettings={toggleSettings}
				isPaused={isPaused.value}
			/>

			<SettingsPanel
				isVisible={showSettings.value}
				settings={settings.value}
				onApply={applySettings}
				onCancel={() => (showSettings.value = false)}
			/>

			<main className="main-content">
				<div className="tabs">
					<button
						className={`tab ${activeTab.value === "updates" ? "active" : ""}`}
						onClick={() => (activeTab.value = "updates")}
					>
						Updates
					</button>
					<button
						className={`tab ${activeTab.value === "graph" ? "active" : ""}`}
						onClick={() => (activeTab.value = "graph")}
					>
						Dependency Graph
					</button>
				</div>
				<div className="tab-content">
					{!isConnected.value ? (
						<EmptyState onRefresh={refreshDetection} />
					) : (
						<>
							{activeTab.value === "updates" && (
								<UpdatesContainer
									updates={updatesStore.updates.value}
									signalCounts={updatesStore.signalCounts.value}
								/>
							)}
							{activeTab.value === "graph" && (
								<GraphVisualization updates={updatesStore.updates.value} />
							)}
						</>
					)}
				</div>
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
