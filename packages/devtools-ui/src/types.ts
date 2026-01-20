/**
 * Re-export types from the adapter package for convenience
 */
export type {
	SignalUpdate,
	SignalDisposed,
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
	type: "signal" | "computed" | "effect";
	x: number;
	y: number;
	depth: number;
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
