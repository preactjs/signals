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
	createConnectionStore,
	createUpdatesStore,
	createSettingsStore,
	type DevToolsContext,
	type SignalUpdate,
	type UpdateTreeNode,
	type UpdateTreeNodeSingle,
	type UpdateTreeNodeGroup,
	type Divider,
} from "./context";

// Types
export type { GraphNode, GraphLink, GraphData } from "./types";

// Components for custom compositions
export {
	Button,
	EmptyState,
	GraphVisualization,
	Header,
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

// Custom element for shadow DOM encapsulation
export {
	SignalsDevToolsElement,
	registerDevToolsElement,
	DEVTOOLS_STYLES,
} from "./custom-element";
