import { render } from "preact";
import { useSignal } from "@preact/signals";
import type { DevToolsAdapter } from "@preact/signals-devtools-adapter";
import { EmptyState } from "./components/EmptyState";
import { Header } from "./components/Header";
import { PerformanceInsights } from "./components/PerformanceInsights";
import { SettingsPanel } from "./components/SettingsPanel";
import { GraphVisualization } from "./components/Graph";
import { UpdatesContainer } from "./components/UpdatesContainer";
import {
	createDevToolsContext,
	destroyDevToolsContext,
	getContext,
	setCurrentDevToolsContext,
} from "./context";

type PanelTab = "updates" | "performance" | "graph";

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
	{ id: "updates", label: "Updates" },
	{ id: "performance", label: "Performance" },
	{ id: "graph", label: "Dependency Graph" },
];

export interface DevToolsPanelProps {
	/** Hide the header (useful for embedded contexts) */
	hideHeader?: boolean;
	/** Initial tab to show */
	initialTab?: PanelTab;
}

export function DevToolsPanel({
	hideHeader = false,
	initialTab = "updates",
}: DevToolsPanelProps = {}) {
	const { connectionStore } = getContext();
	const activeTab = useSignal<PanelTab>(initialTab);

	return (
		<div className="signals-devtools">
			{!hideHeader && <Header />}

			<SettingsPanel />

			<main className="main-content">
				<div className="tabs" role="tablist" aria-label="DevTools views">
					{PANEL_TABS.map(tab => (
						<button
							key={tab.id}
							id={`tab-${tab.id}`}
							className={`tab ${activeTab.value === tab.id ? "active" : ""}`}
							onClick={() => (activeTab.value = tab.id)}
							role="tab"
							aria-selected={activeTab.value === tab.id}
							aria-controls={`tabpanel-${tab.id}`}
							tabindex={activeTab.value === tab.id ? 0 : -1}
						>
							{tab.label}
						</button>
					))}
				</div>
				<div
					className="tab-content"
					role="tabpanel"
					aria-labelledby={`tab-${activeTab.value}`}
					id={`tabpanel-${activeTab.value}`}
				>
					{!connectionStore.isConnected.value ? (
						<EmptyState onRefresh={connectionStore.refreshConnection} />
					) : (
						<>
							{activeTab.value === "updates" && <UpdatesContainer />}
							{activeTab.value === "performance" && <PerformanceInsights />}
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
	const context = createDevToolsContext(adapter);

	try {
		await adapter.connect();
	} catch (error) {
		destroyDevToolsContext(context);
		throw error;
	}

	setCurrentDevToolsContext(context);

	// Clear existing content
	container.innerHTML = "";

	// Render the panel
	render(<DevToolsPanel {...panelProps} />, container);

	// Return cleanup function
	return () => {
		render(null, container);
		destroyDevToolsContext(context);
	};
}
