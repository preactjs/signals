import { UpdateInfo } from "./internal";

/** Formatted signal update for external consumers */
export interface FormattedSignalUpdate {
	type: "update" | "effect";
	signalType: "signal" | "computed" | "effect";
	signalName: string;
	signalId: string;
	componentNames?: string[];
	prevValue?: any;
	newValue?: any;
	timestamp: number;
	depth: number;
}

/** Component effect info for tracking component lifecycle */
export interface ComponentEffectInfo {
	componentName: string;
	effectId: string;
}

// Communication layer for Chrome DevTools Extension
export interface DevToolsMessage {
	type:
		| "SIGNALS_UPDATE"
		| "SIGNALS_INIT"
		| "SIGNALS_CONFIG"
		| "COMPONENT_MOUNT"
		| "COMPONENT_UNMOUNT"
		| "COMPONENT_RENDER";
	payload: any;
	timestamp: number;
}

export interface SignalsDevToolsAPI {
	onUpdate: (
		callback: (updates: FormattedSignalUpdate[]) => void
	) => () => void;
	onInit: (callback: () => void) => () => void;
	sendConfig: (config: any) => void;
	sendUpdate: (updateInfo: UpdateInfo[]) => void;
	isConnected: () => boolean;
	/** Register a component's updater effect - called when effect is created */
	registerComponentEffect: (effect: any, componentName: string) => void;
	/** Unregister a component's updater effect - called when effect is disposed */
	unregisterComponentEffect: (effect: any) => void;
	/** Notify that a component is re-rendering due to signal change */
	notifyComponentRender: (effect: any) => void;
	/** Track signal ownership by the current rendering component */
	trackSignalOwnership: (signal: any) => void;
	/** Subscribe to component mount events */
	onComponentMount?: (
		callback: (info: { componentName: string; instanceCount: number }) => void
	) => () => void;
	/** Subscribe to component unmount events */
	onComponentUnmount?: (
		callback: (info: {
			componentName: string;
			remainingInstances: number;
		}) => void
	) => () => void;
	/** Subscribe to component render events */
	onComponentRender?: (
		callback: (info: { componentName: string }) => void
	) => () => void;
	/** Set the currently rendering component for signal ownership tracking */
	setCurrentRenderingComponent?: (effect: any) => void;
	/** Clear the currently rendering component */
	clearCurrentRenderingComponent?: () => void;
	/** @deprecated Use registerComponentEffect instead */
	enterComponent?: (node: any) => void;
	/** @deprecated Use unregisterComponentEffect instead */
	exitComponent?: () => void;
}

class DevToolsCommunicator {
	public listeners: Map<string, Set<Function>> = new Map();
	public isExtensionConnected = false;
	public messageQueue: DevToolsMessage[] = [];
	public readonly maxQueueSize = 100;
	/** Map from effect to component name - tracks active component effects */
	public componentEffects = new WeakMap<any, string>();
	/** Map from component name to instance count - tracks how many instances are mounted */
	public componentInstanceCounts = new Map<string, number>();
	/** Map from signal to owning component names */
	public signalOwnership = new WeakMap<any, Set<string>>();
	/** Currently rendering component (from the current effect being tracked) */
	public currentRenderingComponent: string | null = null;

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
		const formattedUpdates = updateInfoList.map(({ signal, ...info }) => {
			const owners = this.getSignalOwners(signal);
			return info.type === "value"
				? {
						...info,
						type: "update" as const,
						newValue: deeplyRemoveFunctions(info.newValue),
						prevValue: deeplyRemoveFunctions(info.prevValue),
						signalType: ("_fn" in signal ? "computed" : "signal") as
							| "signal"
							| "computed",
						signalName: this.getSignalName(signal),
						signalId: this.getSignalId(signal),
						componentNames: owners.length > 0 ? owners : undefined,
					}
				: {
						...info,
						type: "effect" as const,
						signalType: "effect" as const,
						signalName: this.getSignalName(signal),
						signalId: this.getSignalId(signal),
						componentNames: owners.length > 0 ? owners : undefined,
					};
		});

		// Emit for direct listeners (e.g., DirectAdapter)
		this.emit("update", formattedUpdates);

		// Post message for browser extension
		this.postMessage({
			type: "SIGNALS_UPDATE",
			payload: {
				updates: formattedUpdates,
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

	/** Register a component's updater effect */
	public registerComponentEffect(effect: any, componentName: string) {
		this.componentEffects.set(effect, componentName);

		// Increment instance count
		const count = this.componentInstanceCounts.get(componentName) || 0;
		this.componentInstanceCounts.set(componentName, count + 1);

		// Emit mount event
		this.emit("componentMount", {
			componentName,
			effectId: this.getEffectId(effect),
		});
		this.postMessage({
			type: "COMPONENT_MOUNT",
			payload: { componentName, instanceCount: count + 1 },
			timestamp: Date.now(),
		});
	}

	/** Unregister a component's updater effect */
	public unregisterComponentEffect(effect: any) {
		const componentName = this.componentEffects.get(effect);
		if (!componentName) return;

		this.componentEffects.delete(effect);

		// Decrement instance count
		const count = (this.componentInstanceCounts.get(componentName) || 1) - 1;
		if (count <= 0) {
			this.componentInstanceCounts.delete(componentName);
			// All instances unmounted - clean up signal ownership for this component
			// Note: We can't easily clean WeakMap, but the graph will filter by active components
		} else {
			this.componentInstanceCounts.set(componentName, count);
		}

		// Emit unmount event
		this.emit("componentUnmount", {
			componentName,
			effectId: this.getEffectId(effect),
			remainingInstances: count,
		});
		this.postMessage({
			type: "COMPONENT_UNMOUNT",
			payload: { componentName, remainingInstances: count },
			timestamp: Date.now(),
		});
	}

	/** Notify that a component is re-rendering due to signal change */
	public notifyComponentRender(effect: any) {
		const componentName = this.componentEffects.get(effect);
		if (!componentName) return;

		this.emit("componentRender", {
			componentName,
			effectId: this.getEffectId(effect),
		});
		this.postMessage({
			type: "COMPONENT_RENDER",
			payload: { componentName },
			timestamp: Date.now(),
		});
	}

	/** Set the currently rendering component for signal ownership tracking */
	public setCurrentRenderingComponent(effect: any) {
		this.currentRenderingComponent = this.componentEffects.get(effect) || null;
	}

	/** Clear the currently rendering component */
	public clearCurrentRenderingComponent() {
		this.currentRenderingComponent = null;
	}

	public trackSignalOwnership(signal: any) {
		if (this.currentRenderingComponent) {
			if (!this.signalOwnership.has(signal)) {
				this.signalOwnership.set(signal, new Set());
			}
			this.signalOwnership.get(signal)!.add(this.currentRenderingComponent);
		}
	}

	public getSignalOwners(signal: any): string[] {
		const owners = this.signalOwnership.get(signal);
		if (!owners) return [];
		// Filter to only return owners that still have mounted instances
		return Array.from(owners).filter(name =>
			this.componentInstanceCounts.has(name)
		);
	}

	public getEffectId(effect: any): string {
		if (!effect._debugEffectId) {
			effect._debugEffectId = `effect_${Math.random().toString(36).substr(2, 9)}`;
		}
		return effect._debugEffectId;
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

function deeplyRemoveFunctions(obj: any): any {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "function") return "[Function]";
	if (typeof obj !== "object") return obj;

	if (Array.isArray(obj)) {
		return obj.map(deeplyRemoveFunctions);
	}

	const result: any = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			result[key] = deeplyRemoveFunctions(obj[key]);
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
		onInit: callback => getDevToolsCommunicator().onInit(callback),
		sendConfig: config => getDevToolsCommunicator().sendConfig(config),
		sendUpdate: updateInfo => getDevToolsCommunicator().sendUpdate(updateInfo),
		isConnected: () => getDevToolsCommunicator().isConnected(),
		registerComponentEffect: (effect, componentName) =>
			getDevToolsCommunicator().registerComponentEffect(effect, componentName),
		unregisterComponentEffect: effect =>
			getDevToolsCommunicator().unregisterComponentEffect(effect),
		notifyComponentRender: effect =>
			getDevToolsCommunicator().notifyComponentRender(effect),
		trackSignalOwnership: signal =>
			getDevToolsCommunicator().trackSignalOwnership(signal),
		// Component lifecycle event subscriptions
		onComponentMount: callback =>
			getDevToolsCommunicator().addListener("componentMount", callback),
		onComponentUnmount: callback =>
			getDevToolsCommunicator().addListener("componentUnmount", callback),
		onComponentRender: callback =>
			getDevToolsCommunicator().addListener("componentRender", callback),
		// Set/clear current rendering component for signal ownership tracking
		setCurrentRenderingComponent: effect =>
			getDevToolsCommunicator().setCurrentRenderingComponent(effect),
		clearCurrentRenderingComponent: () =>
			getDevToolsCommunicator().clearCurrentRenderingComponent(),
		// Deprecated methods for backwards compatibility
		enterComponent: node => {
			// Legacy: set current component name directly for tracking
			const name =
				typeof node === "string"
					? node
					: node?.type?.displayName || node?.type?.name || "Unknown";
			getDevToolsCommunicator().currentRenderingComponent = name;
		},
		exitComponent: () => {
			getDevToolsCommunicator().currentRenderingComponent = null;
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
