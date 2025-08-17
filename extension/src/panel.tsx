import { render } from "preact";
import { useSignal } from "@preact/signals";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { GraphVisualization } from "./components/Graph";
import { UpdatesContainer } from "./components/UpdatesContainer";
import { connectionStore } from "./models/ConnectionModel";

function SignalsDevToolsPanel() {
	const activeTab = useSignal<"updates" | "graph">("updates");

	return (
		<div id="app">
			<Header />

			<SettingsPanel />

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
							{activeTab.value === "updates" && <UpdatesContainer />}
							{activeTab.value === "graph" && <GraphVisualization />}
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
