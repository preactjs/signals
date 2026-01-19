import type {
	DevToolsAdapter,
	AdapterEvents,
	Unsubscribe,
	ConnectionStatus,
	Settings,
} from "./types";

type EventMap = {
	[K in keyof AdapterEvents]: Set<AdapterEvents[K]>;
};

/**
 * Base adapter class that provides common event handling functionality.
 * Extend this class to create specific adapter implementations.
 */
export abstract class BaseAdapter implements DevToolsAdapter {
	protected listeners: EventMap = {
		signalUpdate: new Set(),
		signalDisposed: new Set(),
		signalInit: new Set(),
		signalsAvailable: new Set(),
		configReceived: new Set(),
		connectionStatusChanged: new Set(),
		backgroundReady: new Set(),
		contentScriptDisconnected: new Set(),
	};

	protected connectionStatus: ConnectionStatus = {
		status: "disconnected",
		message: "Not connected",
	};

	protected signalsAvailable = false;

	abstract connect(): Promise<void>;
	abstract disconnect(): void;
	abstract sendConfig(config: Settings): void;
	abstract requestState(): void;

	on<K extends keyof AdapterEvents>(
		event: K,
		listener: AdapterEvents[K]
	): Unsubscribe {
		const listenerSet = this.listeners[event] as Set<AdapterEvents[K]>;
		listenerSet.add(listener);
		return () => {
			listenerSet.delete(listener);
		};
	}

	getConnectionStatus(): ConnectionStatus {
		return this.connectionStatus;
	}

	isSignalsAvailable(): boolean {
		return this.signalsAvailable;
	}

	protected emit<K extends keyof AdapterEvents>(
		event: K,
		...args: Parameters<AdapterEvents[K]>
	): void {
		const listenerSet = this.listeners[event];
		listenerSet.forEach((listener: any) => {
			try {
				listener(...args);
			} catch (error) {
				console.error(`Error in ${event} listener:`, error);
			}
		});
	}

	protected setConnectionStatus(status: ConnectionStatus): void {
		this.connectionStatus = status;
		this.emit("connectionStatusChanged", status);
	}

	protected setSignalsAvailable(available: boolean): void {
		this.signalsAvailable = available;
		this.emit("signalsAvailable", available);
	}
}
