import { render } from "preact";
import { useSignal } from "@preact/signals";
import type { DevToolsAdapter } from "@preact/signals-devtools-adapter";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { SettingsPanel } from "./components/SettingsPanel";
import { GraphVisualization } from "./components/Graph";
import { UpdatesContainer } from "./components/UpdatesContainer";
import { initDevTools, destroyDevTools, getContext } from "./context";

export interface DevToolsPanelProps {
	/** Hide the header (useful for embedded contexts) */
	hideHeader?: boolean;
	/** Initial tab to show */
	initialTab?: "updates" | "graph";
}

export function DevToolsPanel({
	hideHeader = false,
	initialTab = "updates",
}: DevToolsPanelProps = {}) {
	const { connectionStore } = getContext();
	const activeTab = useSignal<"updates" | "graph">(initialTab);

	return (
		<div className="signals-devtools">
			{!hideHeader && <Header />}

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

export interface MountOptions extends DevToolsPanelProps {
	/** The adapter to use for communication */
	adapter: DevToolsAdapter;
	/** The container element to render into */
	container: HTMLElement;
}

/**
 * Mount the DevTools UI into a container element.
 *
 * @example
 * ```tsx
 * import { mount } from "@preact/signals-devtools-ui";
 * import { createDirectAdapter } from "@preact/signals-devtools-adapter";
 *
 * const adapter = createDirectAdapter();
 *
 * const unmount = await mount({
 *   adapter,
 *   container: document.getElementById("devtools")!,
 * });
 *
 * // Later, to cleanup:
 * unmount();
 * ```
 */
export async function mount(options: MountOptions): Promise<() => void> {
	const { adapter, container, ...panelProps } = options;

	// Initialize context with adapter
	initDevTools(adapter);

	// Connect the adapter
	await adapter.connect();

	// Clear existing content
	container.innerHTML = "";

	// Render the panel
	render(<DevToolsPanel {...panelProps} />, container);

	// Return cleanup function
	return () => {
		render(null, container);
		destroyDevTools();
	};
}
