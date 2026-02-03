/**
 * Rich dependency information for a signal/computed
 */
export interface DependencyInfo {
	id: string;
	name: string;
	type: "signal" | "computed";
}

/**
 * Represents a signal update event from the debug system
 */
export interface SignalUpdate {
	type: "update" | "effect" | "component";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId?: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
	/** All dependencies this computed/effect currently depends on (with rich info) */
	allDependencies?: DependencyInfo[];
}

/**
 * Represents a signal disposal event from the debug system
 */
export interface SignalDisposed {
	type: "disposed";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId: string;
	timestamp: number;
}

/**
 * Settings that can be configured for the debug system
 */
export interface Settings {
	enabled: boolean;
	grouped: boolean;
	consoleLogging: boolean;
	maxUpdatesPerSecond: number;
	filterPatterns: string[];
}

/**
 * Connection status states
 */
export type ConnectionStatusType =
	| "connected"
	| "disconnected"
	| "connecting"
	| "warning";

/**
 * Connection status with message
 */
export interface ConnectionStatus {
	status: ConnectionStatusType;
	message: string;
}

/**
 * Configuration received from the debug system
 */
export interface DebugConfig {
	settings: Settings;
}

/**
 * Events that the adapter can emit to the UI
 */
export interface AdapterEvents {
	/** Signal updates received from the debug system */
	signalUpdate: (updates: SignalUpdate[]) => void;
	/** Signal disposal events received from the debug system */
	signalDisposed: (disposals: SignalDisposed[]) => void;
	/** Initialization signal from the debug system */
	signalInit: () => void;
	/** Signals availability changed */
	signalsAvailable: (available: boolean) => void;
	/** Configuration received from debug system */
	configReceived: (config: DebugConfig) => void;
	/** Connection status changed */
	connectionStatusChanged: (status: ConnectionStatus) => void;
	/** Background ready (browser extension specific, but kept for compatibility) */
	backgroundReady: (contentScriptConnected: boolean) => void;
	/** Content script disconnected (browser extension specific) */
	contentScriptDisconnected: () => void;
}

/**
 * Event listener cleanup function
 */
export type Unsubscribe = () => void;

/**
 * Communication adapter interface that UI components use to communicate
 * with the signals debug system. This abstraction allows the UI to work
 * with different communication mechanisms (browser extension, postMessage, WebSocket, etc.)
 */
export interface DevToolsAdapter {
	/**
	 * Initialize the adapter and establish connection
	 */
	connect(): Promise<void>;

	/**
	 * Clean up resources and disconnect
	 */
	disconnect(): void;

	/**
	 * Send configuration to the debug system
	 */
	sendConfig(config: Settings): void;

	/**
	 * Request current state from the debug system
	 */
	requestState(): void;

	/**
	 * Subscribe to an event
	 */
	on<K extends keyof AdapterEvents>(
		event: K,
		listener: AdapterEvents[K]
	): Unsubscribe;

	/**
	 * Get current connection status
	 */
	getConnectionStatus(): ConnectionStatus;

	/**
	 * Check if signals are available
	 */
	isSignalsAvailable(): boolean;
}

/**
 * Factory function type for creating adapters
 */
export type AdapterFactory<T = void> = (options?: T) => DevToolsAdapter;
