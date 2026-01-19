import { BaseAdapter } from "./base-adapter";
import type { Settings, SignalUpdate, SignalDisposed } from "./types";

export interface DirectAdapterOptions {
	/**
	 * Reference to the window containing the signals debug API
	 */
	targetWindow?: Window;
	/**
	 * Polling interval in ms to check for signals API availability
	 */
	pollInterval?: number;
	/**
	 * Maximum time to wait for signals API in ms
	 */
	maxWaitTime?: number;
}

/**
 * Direct adapter that communicates directly with the signals debug API.
 *
 * This adapter is used when the DevTools UI is embedded directly in the page
 * (e.g., in an iframe, overlay, or blog post demo) rather than in a browser
 * extension context.
 */
export class DirectAdapter extends BaseAdapter {
	private targetWindow: Window;
	private pollInterval: number;
	private maxWaitTime: number;
	private devtoolsAPI: any = null;
	private cleanupFns: Array<() => void> = [];
	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor(options: DirectAdapterOptions = {}) {
		super();
		this.targetWindow = options.targetWindow ?? window;
		this.pollInterval = options.pollInterval ?? 100;
		this.maxWaitTime = options.maxWaitTime ?? 10000;
	}

	async connect(): Promise<void> {
		this.setConnectionStatus({
			status: "connecting",
			message: "Looking for signals...",
		});

		// Try to connect immediately
		if (this.tryConnect()) {
			return;
		}

		// Poll for the API to become available
		return new Promise<void>(resolve => {
			const startTime = Date.now();

			this.pollTimer = setInterval(() => {
				if (this.tryConnect()) {
					if (this.pollTimer) {
						clearInterval(this.pollTimer);
						this.pollTimer = null;
					}
					resolve();
				} else if (Date.now() - startTime > this.maxWaitTime) {
					if (this.pollTimer) {
						clearInterval(this.pollTimer);
						this.pollTimer = null;
					}
					this.setConnectionStatus({
						status: "warning",
						message: "No signals detected",
					});
					this.setSignalsAvailable(false);
					resolve();
				}
			}, this.pollInterval);
		});
	}

	disconnect(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}

		this.cleanupFns.forEach(fn => {
			try {
				fn();
			} catch (error) {
				console.error("Error during cleanup:", error);
			}
		});
		this.cleanupFns = [];

		this.devtoolsAPI = null;
		this.setConnectionStatus({
			status: "disconnected",
			message: "Disconnected",
		});
	}

	sendConfig(config: Settings): void {
		if (this.devtoolsAPI?.sendConfig) {
			this.devtoolsAPI.sendConfig(config);
		}

		// Also post message for any listeners
		this.targetWindow.postMessage(
			{
				type: "CONFIGURE_DEBUG",
				payload: config,
			},
			this.targetWindow.location.origin
		);
	}

	requestState(): void {
		this.targetWindow.postMessage(
			{
				type: "REQUEST_STATE",
			},
			this.targetWindow.location.origin
		);
	}

	private tryConnect(): boolean {
		const api = (this.targetWindow as any).__PREACT_SIGNALS_DEVTOOLS__;

		if (!api) {
			return false;
		}

		this.devtoolsAPI = api;

		// Subscribe to updates
		const updateUnsubscribe = api.onUpdate((updates: SignalUpdate[]) => {
			this.emit("signalUpdate", updates);
		});
		this.cleanupFns.push(updateUnsubscribe);

		// Subscribe to disposal events
		if (api.onDisposal) {
			const disposalUnsubscribe = api.onDisposal(
				(disposals: SignalDisposed[]) => {
					this.emit("signalDisposed", disposals);
				}
			);
			this.cleanupFns.push(disposalUnsubscribe);
		}

		// Subscribe to init events
		const initUnsubscribe = api.onInit(() => {
			this.emit("signalInit");
		});
		this.cleanupFns.push(initUnsubscribe);

		this.setSignalsAvailable(true);
		this.setConnectionStatus({
			status: "connected",
			message: "Connected",
		});

		return true;
	}
}

/**
 * Factory function to create a direct adapter
 */
export function createDirectAdapter(
	options?: DirectAdapterOptions
): DirectAdapter {
	return new DirectAdapter(options);
}
