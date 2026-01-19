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
	type: "signal" | "computed" | "effect" | "component";
	x: number;
	y: number;
	depth: number;
}

export interface GraphLink {
	source: string;
	target: string;
}

export interface ComponentGroup {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	nodes: GraphNode[];
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
	components: ComponentGroup[];
}

export type Divider = { type: "divider" };
