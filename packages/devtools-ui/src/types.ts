import type { ModelInfo } from "@preact/signals-devtools-adapter";

/**
 * Re-export types from the adapter package for convenience
 */
export type {
	SignalUpdate,
	SignalDisposed,
	DependencyInfo,
	ModelInfo,
	Settings,
	ConnectionStatus,
	ConnectionStatusType,
	DevToolsAdapter,
} from "@preact/signals-devtools-adapter";

/**
 * Graph-related types
 */
export interface GraphNode {
	id: string;
	name: string;
	type: "signal" | "computed" | "effect" | "component";
	x: number;
	y: number;
	depth: number;
	models?: ModelInfo[];
}

export interface GraphLink {
	source: string;
	target: string;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export type Divider = { type: "divider" };
