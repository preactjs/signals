// Main component and mount function
export {
	DevToolsPanel,
	mount,
	type MountOptions,
	type DevToolsPanelProps,
} from "./DevToolsPanel";

// Context and stores
export {
	initDevTools,
	destroyDevTools,
	getContext,
	ConnectionModel,
	UpdatesModel,
	PerformanceInsightsModel,
	SettingsModel,
	type DevToolsContext,
	type SignalUpdate,
	type UpdateTreeNode,
	type UpdateTreeNodeSingle,
	type UpdateTreeNodeGroup,
	type Divider,
	type PerformanceObservation,
	type PerformanceInsightsData,
	type PerformanceInstanceSummary,
} from "./context";

// Types
export type { GraphNode, GraphLink, GraphData } from "./types";

// Components for custom compositions
export {
	Button,
	EmptyState,
	GraphVisualization,
	Header,
	PerformanceInsights,
	SettingsPanel,
	StatusIndicator,
	UpdateItem,
	UpdateTreeNodeComponent,
	UpdatesContainer,
} from "./components";

// Re-export adapter types for convenience
export type {
	DevToolsAdapter,
	Settings,
	ConnectionStatus,
	ConnectionStatusType,
} from "@preact/signals-devtools-adapter";
