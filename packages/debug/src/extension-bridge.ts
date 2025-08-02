import { setDebugOptions } from ".";
import { getDevToolsCommunicator } from "./devtools";

/**
 * Chrome Extension Bridge
 *
 * This module provides utilities to help Chrome extensions integrate
 * with the Preact Signals debug system.
 */

export interface ExtensionConfig {
	enabled?: boolean;
	grouped?: boolean;
	spacing?: number;
	maxUpdatesPerSecond?: number;
	filterPatterns?: string[];
}

class ExtensionBridge {
	private config: ExtensionConfig = {
		enabled: true,
		grouped: true,
		spacing: 0,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	};

	private updateCount = 0;
	private lastSecond = Math.floor(Date.now() / 1000);

	constructor() {
		this.setupExtensionAPI();
	}

	private setupExtensionAPI() {
		if (typeof window === "undefined") return;

		// Listen for configuration changes from the extension
		window.addEventListener("message", event => {
			if (event.origin !== window.location.origin) return;

			const { type, payload } = event.data;

			if (type === "CONFIGURE_DEBUG") {
				this.updateConfig(payload);
			} else if (type === "REQUEST_STATE") {
				this.sendCurrentState();
			}
		});
	}

	private updateConfig(newConfig: Partial<ExtensionConfig>) {
		this.config = { ...this.config, ...newConfig };
		setDebugOptions(this.config);
	}

	private sendCurrentState() {
		getDevToolsCommunicator().sendConfig({
			...this.config,
			timestamp: Date.now(),
			type: "CURRENT_STATE",
		});
	}

	public shouldThrottleUpdate(): boolean {
		const currentSecond = Math.floor(Date.now() / 1000);

		if (currentSecond !== this.lastSecond) {
			this.lastSecond = currentSecond;
			this.updateCount = 0;
		}

		this.updateCount++;
		return this.updateCount > (this.config.maxUpdatesPerSecond || 60);
	}

	public matchesFilter(signalName: string): boolean {
		if (
			!this.config.filterPatterns ||
			this.config.filterPatterns.length === 0
		) {
			return true;
		}

		return this.config.filterPatterns.some(pattern => {
			try {
				const regex = new RegExp(pattern, "i");
				return regex.test(signalName);
			} catch {
				// If regex is invalid, fall back to simple string matching
				return signalName.toLowerCase().includes(pattern.toLowerCase());
			}
		});
	}

	public getConfig(): ExtensionConfig {
		return { ...this.config };
	}
}

// Global instance
let extensionBridge: ExtensionBridge | null = null;

export function getExtensionBridge(): ExtensionBridge {
	if (!extensionBridge) {
		extensionBridge = new ExtensionBridge();
	}
	return extensionBridge;
}

/**
 * Helper functions for Chrome extension developers
 */
export const ExtensionHelpers = {
	/**
	 * Initialize the extension bridge and return the DevTools API
	 */
	init() {
		const bridge = getExtensionBridge();
		const communicator = getDevToolsCommunicator();

		return {
			bridge,
			communicator,
			onUpdate: communicator.onUpdate.bind(communicator),
			onInit: communicator.onInit.bind(communicator),
			isConnected: communicator.isConnected.bind(communicator),
			sendConfig: communicator.sendConfig.bind(communicator),
		};
	},

	/**
	 * Send a message to indicate the extension is connected
	 */
	announceConnection() {
		if (typeof window !== "undefined") {
			window.postMessage(
				{
					type: "DEVTOOLS_CONNECTED",
					timestamp: Date.now(),
				},
				window.location.origin
			);
		}
	},

	/**
	 * Send a message to indicate the extension is disconnected
	 */
	announceDisconnection() {
		if (typeof window !== "undefined") {
			window.postMessage(
				{
					type: "DEVTOOLS_DISCONNECTED",
					timestamp: Date.now(),
				},
				window.location.origin
			);
		}
	},

	/**
	 * Request current debug state from the page
	 */
	requestState() {
		if (typeof window !== "undefined") {
			window.postMessage(
				{
					type: "REQUEST_STATE",
					timestamp: Date.now(),
				},
				window.location.origin
			);
		}
	},

	/**
	 * Configure debug options
	 */
	configure(config: Partial<ExtensionConfig>) {
		if (typeof window !== "undefined") {
			window.postMessage(
				{
					type: "CONFIGURE_DEBUG",
					payload: config,
					timestamp: Date.now(),
				},
				window.location.origin
			);
		}
	},
};
