import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createBrowserExtensionAdapter,
	createDirectAdapter,
	createPostMessageAdapter,
	normalizeDebugConfig,
	type Settings,
	type SignalDisposed,
	type SignalUpdate,
} from "../src/index";

const SETTINGS: Settings = {
	enabled: true,
	grouped: true,
	consoleLogging: false,
	maxUpdatesPerSecond: 120,
	filterPatterns: ["count"],
};

type MessageListener = (event: MessageEvent) => void;

class FakeWindow {
	public location = { origin: "https://example.test" };
	public postMessage = vi.fn((message: unknown, targetOrigin: string) => {
		this.sentMessages.push({ message, targetOrigin });
	});
	public sentMessages: Array<{ message: unknown; targetOrigin: string }> = [];
	private listeners = new Set<MessageListener>();

	addEventListener(type: string, listener: MessageListener) {
		if (type === "message") {
			this.listeners.add(listener);
		}
	}

	removeEventListener(type: string, listener: MessageListener) {
		if (type === "message") {
			this.listeners.delete(listener);
		}
	}

	emitMessage(data: unknown, source: FakeWindow = this) {
		const event = {
			data,
			origin: this.location.origin,
			source,
		} as unknown as MessageEvent;

		for (const listener of this.listeners) {
			listener(event);
		}
	}

	listenerCount() {
		return this.listeners.size;
	}
}

describe("@preact/signals-devtools-adapter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("normalizeDebugConfig", () => {
		it("normalizes wrapped settings payloads", () => {
			expect(normalizeDebugConfig({ settings: SETTINGS })).toEqual({
				settings: SETTINGS,
			});
		});

		it("normalizes flat settings payloads", () => {
			expect(normalizeDebugConfig(SETTINGS)).toEqual({
				settings: SETTINGS,
			});
		});

		it("rejects malformed payloads", () => {
			expect(normalizeDebugConfig({ settings: { enabled: true } })).toBeNull();
		});
	});

	describe("PostMessageAdapter", () => {
		it("requests state on connect and normalizes config payloads", async () => {
			const fakeWindow = new FakeWindow();
			const adapter = createPostMessageAdapter({
				sourceWindow: fakeWindow as unknown as Window,
				sourceOrigin: fakeWindow.location.origin,
			});
			const onConfig = vi.fn();

			adapter.on("configReceived", onConfig);
			await adapter.connect();

			expect(fakeWindow.postMessage).toHaveBeenCalledWith(
				{ type: "REQUEST_STATE" },
				fakeWindow.location.origin
			);

			fakeWindow.emitMessage({ type: "SIGNALS_CONFIG", payload: SETTINGS });

			expect(onConfig).toHaveBeenCalledWith({ settings: SETTINGS });
		});

		it("updates connection state from availability messages", async () => {
			const fakeWindow = new FakeWindow();
			const adapter = createPostMessageAdapter({
				sourceWindow: fakeWindow as unknown as Window,
				sourceOrigin: fakeWindow.location.origin,
			});

			await adapter.connect();
			fakeWindow.emitMessage({
				type: "SIGNALS_AVAILABLE",
				payload: { available: true },
			});

			expect(adapter.isSignalsAvailable()).toBe(true);
			expect(adapter.getConnectionStatus()).toEqual({
				status: "connected",
				message: "Connected",
			});
		});
	});

	describe("BrowserExtensionAdapter", () => {
		it("handles current and legacy availability messages", async () => {
			const fakeWindow = new FakeWindow();
			const adapter = createBrowserExtensionAdapter({
				targetWindow: fakeWindow as unknown as Window,
				allowedOrigin: fakeWindow.location.origin,
			});

			await adapter.connect();
			vi.advanceTimersByTime(100);
			fakeWindow.emitMessage({ type: "BACKGROUND_READY", payload: true });

			fakeWindow.emitMessage({
				type: "SIGNALS_AVAILABLE",
				payload: { available: true },
			});
			expect(adapter.isSignalsAvailable()).toBe(true);

			fakeWindow.emitMessage({
				type: "SIGNALS_AVAILABILITY",
				payload: { available: false },
			});
			expect(adapter.isSignalsAvailable()).toBe(false);
			expect(adapter.getConnectionStatus()).toEqual({
				status: "warning",
				message: "No signals detected",
			});
		});

		it("normalizes config payloads from the page", async () => {
			const fakeWindow = new FakeWindow();
			const adapter = createBrowserExtensionAdapter({
				targetWindow: fakeWindow as unknown as Window,
				allowedOrigin: fakeWindow.location.origin,
			});
			const onConfig = vi.fn();

			adapter.on("configReceived", onConfig);
			await adapter.connect();

			fakeWindow.emitMessage({ type: "SIGNALS_CONFIG", payload: SETTINGS });

			expect(onConfig).toHaveBeenCalledWith({ settings: SETTINGS });
		});
	});

	describe("DirectAdapter", () => {
		it("connects to the page API and cleans up listeners on disconnect", async () => {
			const updateListeners = new Set<(updates: SignalUpdate[]) => void>();
			const disposalListeners = new Set<
				(disposals: SignalDisposed[]) => void
			>();
			const initListeners = new Set<() => void>();
			const sendConfig = vi.fn();
			const fakeWindow = new FakeWindow() as FakeWindow & {
				__PREACT_SIGNALS_DEVTOOLS__?: unknown;
			};

			fakeWindow.__PREACT_SIGNALS_DEVTOOLS__ = {
				onUpdate(listener: (updates: SignalUpdate[]) => void) {
					updateListeners.add(listener);
					return () => updateListeners.delete(listener);
				},
				onDisposal(listener: (disposals: SignalDisposed[]) => void) {
					disposalListeners.add(listener);
					return () => disposalListeners.delete(listener);
				},
				onInit(listener: () => void) {
					initListeners.add(listener);
					return () => initListeners.delete(listener);
				},
				sendConfig,
			};

			const adapter = createDirectAdapter({
				targetWindow: fakeWindow as unknown as Window,
				pollInterval: 5,
				maxWaitTime: 20,
			});
			const onUpdate = vi.fn();
			adapter.on("signalUpdate", onUpdate);

			await adapter.connect();
			expect(adapter.getConnectionStatus()).toEqual({
				status: "connected",
				message: "Connected",
			});
			expect(updateListeners.size).toBe(1);

			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				receivedAt: Date.now(),
			};
			for (const listener of updateListeners) {
				listener([update]);
			}

			expect(onUpdate).toHaveBeenCalledWith([update]);

			adapter.sendConfig(SETTINGS);
			expect(sendConfig).toHaveBeenCalledWith(SETTINGS);
			expect(fakeWindow.postMessage).toHaveBeenCalledWith(
				{ type: "CONFIGURE_DEBUG", payload: SETTINGS },
				fakeWindow.location.origin
			);

			adapter.disconnect();
			expect(updateListeners.size).toBe(0);
			expect(disposalListeners.size).toBe(0);
			expect(initListeners.size).toBe(0);
		});
	});
});
