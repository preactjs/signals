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
	MAX_TIMELINE_BATCHES,
	type DevToolsContext,
	type SignalUpdate,
	type TimelineUpdate,
	type TimelineBatch,
	type UpdateTreeNode,
	type UpdateTreeNodeSingle,
	type UpdateTreeNodeGroup,
	type Divider,
	type PerformanceObservation,
	type PerformanceInsightsData,
	type PerformanceInstanceSummary,
	type NoOutputChangeOccurrence,
	type HotspotTier,
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
	Timeline,
	MAX_VISIBLE_BATCHES,
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
