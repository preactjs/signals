import { BaseAdapter } from "./base-adapter";
import type { Settings, SignalUpdate, DebugConfig } from "./types";

export interface BrowserExtensionAdapterOptions {
	/**
	 * The target window to communicate with (defaults to current window)
	 */
	targetWindow?: Window;
	/**
	 * The origin to accept messages from (defaults to current origin)
	 */
	allowedOrigin?: string;
}

/**
 * Browser extension adapter that communicates through postMessage
 * with the browser extension's background script via content script.
 *
 * This adapter is used by the DevTools panel UI when running inside
 * a browser extension context.
 */
export class BrowserExtensionAdapter extends BaseAdapter {
	private targetWindow: Window;
	private allowedOrigin: string;
	private messageHandler: ((event: MessageEvent) => void) | null = null;
	private isBackgroundConnected = false;
	private isContentScriptConnected = false;
	private isConnected = false;

	constructor(options: BrowserExtensionAdapterOptions = {}) {
		super();
		this.targetWindow = options.targetWindow ?? window;
		this.allowedOrigin = options.allowedOrigin ?? window.location.origin;
	}

	async connect(): Promise<void> {
		this.setConnectionStatus({
			status: "connecting",
			message: "Connecting to the page...",
		});

		this.messageHandler = this.handleMessage.bind(this);
		this.targetWindow.addEventListener("message", this.messageHandler);

		// Request initial state after a short delay
		setTimeout(() => {
			this.requestState();
		}, 100);
	}

	disconnect(): void {
		if (this.messageHandler) {
			this.targetWindow.removeEventListener("message", this.messageHandler);
			this.messageHandler = null;
		}
		this.setConnectionStatus({
			status: "disconnected",
			message: "Disconnected",
		});
	}

	sendConfig(config: Settings): void {
		this.sendMessage({
			type: "CONFIGURE_DEBUG",
			payload: config,
		});
	}

	requestState(): void {
		this.setConnectionStatus({
			status: "connecting",
			message: "Connecting to the page...",
		});
		this.sendMessage({ type: "REQUEST_STATE" });
	}

	private sendMessage(message: any): void {
		this.targetWindow.postMessage(message, "*");
	}

	private handleMessage(event: MessageEvent): void {
		// Only accept messages from the allowed origin
		if (event.origin !== this.allowedOrigin) return;

		const { type, payload, timestamp } = event.data;

		switch (type) {
			case "SIGNALS_UPDATE":
				this.handleSignalUpdate(payload, timestamp);
				break;

			case "SIGNALS_INIT":
				this.emit("signalInit");
				break;

			case "SIGNALS_AVAILABILITY":
				this.handleSignalsAvailability(payload);
				break;

			case "SIGNALS_CONFIG":
				this.handleConfig(payload);
				break;

			case "DEVTOOLS_READY":
				this.isBackgroundConnected = true;
				this.emit("backgroundReady", this.isContentScriptConnected);
				setTimeout(() => {
					this.requestState();
				}, 500);
				break;

			case "BACKGROUND_READY":
				this.isBackgroundConnected = true;
				this.isContentScriptConnected = !!payload;
				this.emit("backgroundReady", !!payload);
				this.updateConnectionStatus();
				break;

			case "CONTENT_SCRIPT_DISCONNECTED":
				this.isContentScriptConnected = false;
				this.emit("contentScriptDisconnected");
				this.updateConnectionStatus();
				break;

			case "CONNECTION_LOST":
				this.isContentScriptConnected = false;
				this.isBackgroundConnected = false;
				this.updateConnectionStatus();
				break;
		}
	}

	private handleSignalUpdate(
		payload: { updates: SignalUpdate | SignalUpdate[] },
		_timestamp?: number
	): void {
		const updates = Array.isArray(payload.updates)
			? payload.updates
			: [payload.updates];
		this.emit("signalUpdate", updates);
	}

	private handleSignalsAvailability(payload: { available: boolean }): void {
		this.isConnected = payload.available;
		this.isContentScriptConnected = true;
		this.setSignalsAvailable(payload.available);
		this.updateConnectionStatus();
	}

	private handleConfig(payload: DebugConfig): void {
		this.emit("configReceived", payload);
	}

	private updateConnectionStatus(): void {
		let status: "connected" | "disconnected" | "connecting" | "warning";
		let message: string;

		if (!this.isBackgroundConnected) {
			status = "disconnected";
			message = "Not connected to any page";
		} else if (!this.isContentScriptConnected) {
			status = "connecting";
			message = "Connecting to the page...";
		} else if (!this.isConnected) {
			status = "warning";
			message = "No signals detected";
		} else {
			status = "connected";
			message = "Connected";
		}

		this.setConnectionStatus({ status, message });
	}
}

/**
 * Factory function to create a browser extension adapter
 */
export function createBrowserExtensionAdapter(
	options?: BrowserExtensionAdapterOptions
): BrowserExtensionAdapter {
	return new BrowserExtensionAdapter(options);
}
