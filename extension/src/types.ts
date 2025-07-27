export interface SignalUpdate {
	// TODO: add computed
	type: "update" | "effect";
	signalName: string;
	signalId?: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
}

export interface Settings {
	enabled: boolean;
	grouped: boolean;
	maxUpdatesPerSecond: number;
	filterPatterns: string[];
}

export interface ConnectionStatus {
	status: "connected" | "disconnected" | "connecting" | "warning";
	message: string;
}

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
