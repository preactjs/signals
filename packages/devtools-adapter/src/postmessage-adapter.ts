import { BaseAdapter } from "./base-adapter";
import type { Settings, SignalUpdate, SignalDisposed } from "./types";

export interface PostMessageAdapterOptions {
	/**
	 * The source window where the signals debug API is running
	 */
	sourceWindow: Window;
	/**
	 * The target window to post messages to (for sending commands)
	 */
	targetWindow?: Window;
	/**
	 * The origin to accept messages from
	 */
	sourceOrigin: string;
	/**
	 * The origin to post messages to
	 */
	targetOrigin?: string;
}

/**
 * PostMessage adapter for cross-window/iframe communication.
 *
 * This adapter is used when the DevTools UI is in a different window/iframe
 * from the page being debugged (e.g., a separate debug window, an iframe
 * overlay, or communication across frames).
 */
export class PostMessageAdapter extends BaseAdapter {
	private sourceWindow: Window;
	private targetWindow: Window;
	private sourceOrigin: string;
	private targetOrigin: string;
	private messageHandler: ((event: MessageEvent) => void) | null = null;

	constructor(options: PostMessageAdapterOptions) {
		super();
		this.sourceWindow = options.sourceWindow;
		this.targetWindow = options.targetWindow ?? options.sourceWindow;
		this.sourceOrigin = options.sourceOrigin;
		this.targetOrigin = options.targetOrigin ?? options.sourceOrigin;
	}

	async connect(): Promise<void> {
		this.setConnectionStatus({
			status: "connecting",
			message: "Connecting...",
		});

		this.messageHandler = this.handleMessage.bind(this);
		this.sourceWindow.addEventListener("message", this.messageHandler);

		// Request initial state
		this.requestState();
	}

	disconnect(): void {
		if (this.messageHandler) {
			this.sourceWindow.removeEventListener("message", this.messageHandler);
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
		this.sendMessage({ type: "REQUEST_STATE" });
	}

	private sendMessage(message: any): void {
		this.targetWindow.postMessage(message, this.targetOrigin);
	}

	private handleMessage(event: MessageEvent): void {
		// Validate origin
		if (
			event.origin !== this.sourceOrigin ||
			event.source !== this.targetWindow
		)
			return;

		const { type, payload, timestamp } = event.data;

		switch (type) {
			case "SIGNALS_UPDATE":
			case "SIGNALS_UPDATE_FROM_PAGE":
				this.handleSignalUpdate(payload, timestamp);
				break;

			case "SIGNALS_DISPOSED":
			case "SIGNALS_DISPOSED_FROM_PAGE":
				this.handleSignalDisposed(payload);
				break;

			case "SIGNALS_INIT":
			case "SIGNALS_INIT_FROM_PAGE":
				this.emit("signalInit");
				break;

			case "SIGNALS_AVAILABLE":
				this.handleSignalsAvailability(payload);
				break;

			case "SIGNALS_CONFIG":
			case "SIGNALS_CONFIG_FROM_PAGE":
				this.emit("configReceived", payload);
				break;
		}
	}

	private handleSignalUpdate(
		payload:
			| { updates?: SignalUpdate | SignalUpdate[] }
			| SignalUpdate
			| SignalUpdate[],
		_timestamp?: number
	): void {
		let updates: SignalUpdate[];

		if (payload && typeof payload === "object" && "updates" in payload) {
			updates = Array.isArray(payload.updates)
				? payload.updates
				: [payload.updates!];
		} else if (Array.isArray(payload)) {
			updates = payload;
		} else {
			updates = [payload as SignalUpdate];
		}

		this.emit("signalUpdate", updates);
	}

	private handleSignalDisposed(
		payload:
			| { disposals?: SignalDisposed | SignalDisposed[] }
			| SignalDisposed
			| SignalDisposed[]
	): void {
		let disposals: SignalDisposed[];

		if (payload && typeof payload === "object" && "disposals" in payload) {
			disposals = Array.isArray(payload.disposals)
				? payload.disposals
				: [payload.disposals!];
		} else if (Array.isArray(payload)) {
			disposals = payload;
		} else {
			disposals = [payload as SignalDisposed];
		}

		this.emit("signalDisposed", disposals);
	}

	private handleSignalsAvailability(payload: { available: boolean }): void {
		this.setSignalsAvailable(payload.available);

		if (payload.available) {
			this.setConnectionStatus({
				status: "connected",
				message: "Connected",
			});
		} else {
			this.setConnectionStatus({
				status: "warning",
				message: "No signals detected",
			});
		}
	}
}

/**
 * Factory function to create a postMessage adapter
 */
export function createPostMessageAdapter(
	options: PostMessageAdapterOptions
): PostMessageAdapter {
	return new PostMessageAdapter(options);
}
