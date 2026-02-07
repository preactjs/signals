import { UpdateInfo, DependencyInfo } from "./internal";
import {
	getSignalId,
	getSignalName,
	isReactOrPreactElement,
	formatReactElement,
} from "./utils";

/** Formatted signal update for external consumers */
export interface FormattedSignalUpdate {
	type: "update" | "effect" | "component";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId: string;
	prevValue?: any;
	newValue?: any;
	timestamp: number;
	depth: number;
	subscribedTo?: string;
	/** All dependencies this computed/effect currently depends on (with rich info) */
	allDependencies?: DependencyInfo[];
}

/** Formatted signal disposal event for external consumers */
export interface FormattedSignalDisposed {
	type: "disposed";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId: string;
	timestamp: number;
}

// Communication layer for Chrome DevTools Extension
export interface DevToolsMessage {
	type:
		| "SIGNALS_UPDATE"
		| "SIGNALS_INIT"
		| "SIGNALS_CONFIG"
		| "SIGNALS_DISPOSED";
	payload: any;
	timestamp: number;
}

export interface SignalsDevToolsAPI {
	onUpdate: (
		callback: (updates: FormattedSignalUpdate[]) => void
	) => () => void;
	onDisposal: (
		callback: (disposals: FormattedSignalDisposed[]) => void
	) => () => void;
	onInit: (callback: () => void) => () => void;
	sendConfig: (config: any) => void;
	sendUpdate: (updateInfo: UpdateInfo[]) => void;
	sendDisposal: (
		signal: any,
		signalType: "signal" | "computed" | "effect"
	) => void;
	isConnected: () => boolean;
}

class DevToolsCommunicator {
	public listeners: Map<string, Set<Function>> = new Map();
	public isExtensionConnected = false;
	public messageQueue: DevToolsMessage[] = [];
	public readonly maxQueueSize = 100;
	public signalOwnership = new WeakMap<any, Set<string>>();

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
		// Check if there are any listeners or if the extension is connected
		const hasListeners =
			this.listeners.has("update") && this.listeners.get("update")!.size > 0;
		if (!hasListeners && !this.isExtensionConnected) {
			return; // No adapters registered, skip processing
		}

		const formattedUpdates = updateInfoList.map(({ signal, ...info }) => {
			if (info.type === "value") {
				return {
					...info,
					type: "update" as const,
					newValue: deeplyRemoveFunctions(info.newValue),
					prevValue: deeplyRemoveFunctions(info.prevValue),
					signalType: ("_fn" in signal ? "computed" : "signal") as
						| "signal"
						| "computed",
					signalName: this.getSignalName(signal, "value"),
					signalId: this.getSignalId(signal),
				};
			} else if (info.type === "component") {
				return {
					...info,
					type: "component" as const,
					signalType: "component" as const,
					signalName: this.getSignalName(signal, "component"),
					signalId: this.getSignalId(signal),
				};
			} else {
				return {
					...info,
					type: "effect" as const,
					signalType: "effect" as const,
					signalName: this.getSignalName(signal, "effect"),
					signalId: this.getSignalId(signal),
				};
			}
		});

		// Emit for direct listeners (e.g., DirectAdapter)
		if (hasListeners) {
			this.emit("update", formattedUpdates);
		}

		// Post message for browser extension
		if (this.isExtensionConnected) {
			this.postMessage({
				type: "SIGNALS_UPDATE",
				payload: {
					updates: formattedUpdates,
				},
				timestamp: Date.now(),
			});
		}
	}

	public sendConfig(config: any) {
		this.postMessage({
			type: "SIGNALS_CONFIG",
			payload: config,
			timestamp: Date.now(),
		});
	}

	public onUpdate(
		callback: (updates: FormattedSignalUpdate[]) => void
	): () => void {
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

	public getSignalName(signal: any, type: any): string {
		return getSignalName(signal, type);
	}

	public getSignalId(signal: any): string {
		return getSignalId(signal);
	}

	public isConnected(): boolean {
		return this.isExtensionConnected;
	}

	public sendDisposal(
		signal: any,
		signalType: "signal" | "computed" | "effect"
	) {
		const disposal: FormattedSignalDisposed = {
			type: "disposed",
			signalType,
			signalName: this.getSignalName(
				signal,
				signalType === "signal" ? "value" : signalType
			),
			signalId: this.getSignalId(signal),
			timestamp: Date.now(),
		};

		// Emit for direct listeners (e.g., DirectAdapter)
		this.emit("disposal", [disposal]);

		// Post message for browser extension
		this.postMessage({
			type: "SIGNALS_DISPOSED",
			payload: {
				disposals: [disposal],
			},
			timestamp: Date.now(),
		});
	}

	public onDisposal(
		callback: (disposals: FormattedSignalDisposed[]) => void
	): () => void {
		return this.addListener("disposal", callback);
	}
}

const MAX_DEPTH = 5;
const MAX_KEYS = 50;
const MAX_ARRAY_LENGTH = 100;

function deeplyRemoveFunctions(
	obj: any,
	visited: WeakSet<object> | null = null,
	depth = 0
): any {
	// Fast path for primitives - no WeakSet needed
	if (obj === null || obj === undefined) return obj;

	const type = typeof obj;
	if (type === "function") return "[Function]";
	if (typeof obj === "bigint") return obj.toString();
	if (obj instanceof Date) return obj.toISOString();
	if (type !== "object") return obj;

	// Early bail for React/Preact elements - format them concisely
	if (isReactOrPreactElement(obj)) {
		return formatReactElement(obj);
	}

	// Depth check before any object processing
	if (depth > MAX_DEPTH) return "[Max Depth Reached]";

	// Lazy initialization of visited set only when we have objects
	if (visited === null) {
		visited = new WeakSet();
	}

	// Handle circular references
	if (visited.has(obj)) return "[Circular]";
	visited.add(obj);

	let result: any;

	if (Array.isArray(obj)) {
		// Limit array processing for very large arrays
		const len = Math.min(obj.length, MAX_ARRAY_LENGTH);
		result = new Array(len);
		for (let i = 0; i < len; i++) {
			result[i] = deeplyRemoveFunctions(obj[i], visited, depth + 1);
		}
		if (obj.length > MAX_ARRAY_LENGTH) {
			result.push(`[...${obj.length - MAX_ARRAY_LENGTH} more items]`);
		}
	} else {
		result = {};
		const keys = Object.keys(obj);
		const keyCount = Math.min(keys.length, MAX_KEYS);
		for (let i = 0; i < keyCount; i++) {
			const key = keys[i];
			result[key] = deeplyRemoveFunctions(obj[key], visited, depth + 1);
		}
		if (keys.length > MAX_KEYS) {
			result["..."] = `[${keys.length - MAX_KEYS} more keys]`;
		}
	}

	return result;
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
		onDisposal: callback => getDevToolsCommunicator().onDisposal(callback),
		onInit: callback => getDevToolsCommunicator().onInit(callback),
		sendConfig: config => getDevToolsCommunicator().sendConfig(config),
		sendUpdate: updateInfo => getDevToolsCommunicator().sendUpdate(updateInfo),
		sendDisposal: (signal, signalType) =>
			getDevToolsCommunicator().sendDisposal(signal, signalType),
		isConnected: () => getDevToolsCommunicator().isConnected(),
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
