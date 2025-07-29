import { signal, computed, effect } from "@preact/signals";
import { ConnectionStatus, Divider, SignalUpdate } from "../types";
import { updatesStore } from "./UpdatesModel";

type Status = ConnectionStatus["status"];

export const sendMessage = (message: any) => {
	window.postMessage(message, "*");
};

const createConnectionModel = () => {
	const status = signal<Status>("connecting");
	const isPaused = signal<boolean>(false);
	const isBackgroundConnected = signal(false);
	const isContentScriptConnected = signal(false);
	const isConnected = signal(false);

	const message = computed(() => {
		switch (status.value) {
			case "connected":
				return "Connected";
			case "disconnected":
				return "Not connected to any page";
			case "connecting":
				return "Connecting to the page...";
			case "warning":
				return "No signals detected";
		}
	});

	const refreshConnection = () => {
		status.value = "connecting";
		sendMessage({ type: "REQUEST_STATE" });
	};

	effect(() => {
		if (isPaused.value) return;

		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) return;

			const { type, payload } = event.data;

			switch (type) {
				case "SIGNALS_UPDATE": {
					const signalUpdates = payload.updates;
					const updatesArray: Array<SignalUpdate | Divider> = Array.isArray(
						signalUpdates
					)
						? signalUpdates
						: [signalUpdates];

					updatesArray.reverse();
					updatesArray.push({ type: "divider" });

					updatesStore.addUpdate(updatesArray);
					break;
				}
				case "SIGNALS_AVAILABILITY":
					isConnected.value = payload.available;
					break;

				case "CONNECTION_LOST":
					isContentScriptConnected.value = false;
					isBackgroundConnected.value = false;
					break;

				case "DEVTOOLS_READY":
					isBackgroundConnected.value = true;
					setTimeout(() => {
						refreshConnection();
					}, 500);
					break;

				case "BACKGROUND_READY":
					connectionStore.isBackgroundConnected = true;
					connectionStore.isContentScriptConnected = payload;
					break;

				case "CONTENT_SCRIPT_DISCONNECTED":
					connectionStore.isContentScriptConnected = false;
					break;

				default:
					console.log("Unhandled message type:", type);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	});

	effect(() => {
		if (isConnected.value) status.value = "connected";

		if (!isBackgroundConnected.value) {
			status.value = "disconnected";
		} else if (!isContentScriptConnected.value) {
			status.value = "connecting";
		} else if (!isConnected.value) {
			status.value = "warning";
		} else {
			status.value = "connected";
		}
	});

	return {
		get status() {
			return status.value;
		},
		get isPaused() {
			return isPaused.value;
		},
		get message() {
			return message.value;
		},
		get isConnected() {
			return isConnected.value;
		},
		// Actions
		set status(newStatus: Status) {
			status.value = newStatus;
		},
		set isPaused(newPaused: boolean) {
			isPaused.value = newPaused;
		},
		set isBackgroundConnected(newConnected: boolean) {
			isBackgroundConnected.value = newConnected;
		},
		set isContentScriptConnected(newConnected: boolean) {
			isContentScriptConnected.value = newConnected;
		},
		set isConnected(newConnected: boolean) {
			isConnected.value = newConnected;
		},
		refreshConnection,
	};
};

export const connectionStore = createConnectionModel();
