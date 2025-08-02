import { UpdateInfo } from "./internal";

// Communication layer for Chrome DevTools Extension
export interface DevToolsMessage {
	type:
		| "SIGNALS_UPDATE"
		| "SIGNALS_INIT"
		| "SIGNALS_CONFIG"
		| "ENTER_COMPONENT"
		| "EXIT_COMPONENT";
	payload: any;
	timestamp: number;
}

export interface SignalsDevToolsAPI {
	onUpdate: (callback: (updateInfo: UpdateInfo[]) => void) => () => void;
	onInit: (callback: () => void) => () => void;
	sendConfig: (config: any) => void;
	sendUpdate: (updateInfo: UpdateInfo[]) => void;
	isConnected: () => boolean;
	enterComponent: (name: string) => void;
	exitComponent: () => void;
}

class DevToolsCommunicator {
	public listeners: Map<string, Set<Function>> = new Map();
	public isExtensionConnected = false;
	public messageQueue: DevToolsMessage[] = [];
	public readonly maxQueueSize = 100;
	public componentName: string | null = null;

	constructor() {
		this.setupCommunication();
	}

	public setupCommunication() {
		if (typeof window === "undefined") return;

		// Listen for messages from the Chrome extension
		window.addEventListener("message", event => {
			// Only accept messages from same origin for security
			if (event.origin !== window.location.origin) return;

			const { type } = event.data;

			if (type === "DEVTOOLS_CONNECTED") {
				this.isExtensionConnected = true;
				this.flushMessageQueue();
				this.emit("init");
			} else if (type === "DEVTOOLS_DISCONNECTED") {
				this.isExtensionConnected = false;
			}
		});

		// Check if extension is already connected
		this.checkExtensionConnection();
	}

	public checkExtensionConnection() {
		// Send a ping to check if extension is listening
		this.postMessage({
			type: "SIGNALS_INIT",
			payload: { version: "1.0.0" },
			timestamp: Date.now(),
		});
	}

	public postMessage(message: DevToolsMessage) {
		if (typeof window === "undefined") return;

		if (this.isExtensionConnected) {
			window.postMessage(message, window.location.origin);
		} else {
			// Queue messages if extension isn't connected yet
			this.queueMessage(message);
		}
	}

	public queueMessage(message: DevToolsMessage) {
		if (this.messageQueue.length >= this.maxQueueSize) {
			this.messageQueue.shift(); // Remove oldest message
		}
		this.messageQueue.push(message);
	}

	public flushMessageQueue() {
		while (this.messageQueue.length > 0) {
			const message = this.messageQueue.shift();
			if (message) {
				window.postMessage(message, window.location.origin);
			}
		}
	}

	public emit(eventType: string, payload?: any) {
		const listeners = this.listeners.get(eventType);
		if (listeners) {
			listeners.forEach(callback => callback(payload));
		}
	}

	public sendUpdate(updateInfoList: UpdateInfo[]) {
		this.postMessage({
			type: "SIGNALS_UPDATE",
			payload: {
				updates: updateInfoList.map(({ signal, ...info }) => ({
					...info,
					signalType:
						info.type === "effect"
							? "effect"
							: "_fn" in signal
								? "computed"
								: "signal",
					signalName: this.getSignalName(signal),
					signalId: this.getSignalId(signal),
				})),
			},
			timestamp: Date.now(),
		});
	}

	public sendConfig(config: any) {
		this.postMessage({
			type: "SIGNALS_CONFIG",
			payload: config,
			timestamp: Date.now(),
		});
	}

	public onUpdate(callback: (updateInfo: UpdateInfo[]) => void): () => void {
		return this.addListener("update", callback);
	}

	public onInit(callback: () => void): () => void {
		return this.addListener("init", callback);
	}

	public addListener(eventType: string, callback: Function): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)!.add(callback);

		// Return unsubscribe function
		return () => {
			this.listeners.get(eventType)?.delete(callback);
		};
	}

	public enterComponent(name: string) {
		this.componentName = name;
	}

	public exitComponent() {
		this.componentName = null;
	}

	public getSignalName(signal: any): string {
		// Try to get a meaningful name for the signal
		if (signal.displayName) return signal.displayName;
		if (signal.name) return signal.name;
		if (signal._fn && signal._fn.name) return signal._fn.name;
		if ("_fn" in signal) return "Computed";
		return "Signal";
	}

	public getSignalId(signal: any): string {
		// Create a unique identifier for the signal
		if (signal._id) return signal._id;

		// Fallback to creating an ID based on the signal reference
		if (!signal._debugId) {
			signal._debugId = `signal_${Math.random().toString(36).substr(2, 9)}`;
		}
		return signal._debugId;
	}

	public isConnected(): boolean {
		return this.isExtensionConnected;
	}
}

// Global instance
let devToolsCommunicator: DevToolsCommunicator | null = null;

export function getDevToolsCommunicator(): DevToolsCommunicator {
	if (!devToolsCommunicator) {
		devToolsCommunicator = new DevToolsCommunicator();
	}
	return devToolsCommunicator;
}

// Public API for the Chrome extension
if (typeof window !== "undefined") {
	const api: SignalsDevToolsAPI = {
		onUpdate: callback => getDevToolsCommunicator().onUpdate(callback),
		onInit: callback => getDevToolsCommunicator().onInit(callback),
		sendConfig: config => getDevToolsCommunicator().sendConfig(config),
		sendUpdate: updateInfo => getDevToolsCommunicator().sendUpdate(updateInfo),
		isConnected: () => getDevToolsCommunicator().isConnected(),
		enterComponent: name => {
			getDevToolsCommunicator().enterComponent(name);
		},
		exitComponent: () => {
			getDevToolsCommunicator().exitComponent();
		},
	};

	// Expose API globally for the Chrome extension to use
	window.__PREACT_SIGNALS_DEVTOOLS__ = api;

	// Announce availability to Chrome extension
	if (window.postMessage) {
		// Send immediately
		window.postMessage(
			{
				type: "SIGNALS_AVAILABLE",
				payload: { available: true },
			},
			window.location.origin
		);

		// Also send after a short delay in case the extension loads later
		setTimeout(() => {
			window.postMessage(
				{
					type: "SIGNALS_AVAILABLE",
					payload: { available: true },
				},
				window.location.origin
			);
		}, 100);
	}
}

declare global {
	interface Window {
		__PREACT_SIGNALS_DEVTOOLS__: SignalsDevToolsAPI;
	}
}
