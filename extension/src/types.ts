export interface SignalUpdate {
	type: "update" | "effect";
	signalType: "signal" | "computed" | "effect";
	signalName: string;
	signalId?: string;
	componentNames: string[];
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
