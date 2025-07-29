import { render } from "preact";
import { useSignal, useSignalEffect } from "@preact/signals";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { Settings } from "./types";
import { GraphVisualization } from "./components/Graph";
import { updatesStore } from "./models/UpdatesModel";
import { UpdatesContainer } from "./components/UpdatesContainer";
import { connectionStore, sendMessage } from "./models/ConnectionModel";

function SignalsDevToolsPanel() {
	const showSettings = useSignal(false);
	const activeTab = useSignal<"updates" | "graph">("updates");

	// TODO: settings model
	const settings = useSignal<Settings>({
		enabled: true,
		grouped: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});

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

	useSignalEffect(() => {
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

	return (
		<div id="app">
			<Header onToggleSettings={toggleSettings} />

			<SettingsPanel
				isVisible={showSettings}
				settings={settings}
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
					{!connectionStore.isConnected ? (
						<EmptyState onRefresh={connectionStore.refreshConnection} />
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
