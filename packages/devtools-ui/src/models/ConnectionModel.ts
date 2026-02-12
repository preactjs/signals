import { signal, createModel } from "@preact/signals";
import type {
	DevToolsAdapter,
	ConnectionStatus,
	ConnectionStatusType,
} from "@preact/signals-devtools-adapter";

export const ConnectionModel = createModel((adapter: DevToolsAdapter) => {
	const status = signal<ConnectionStatusType>("connecting");
	const message = signal<string>("Connecting...");
	const isConnected = signal(false);

	// Listen to adapter events
	adapter.on(
		"connectionStatusChanged",
		(connectionStatus: ConnectionStatus) => {
			status.value = connectionStatus.status;
			message.value = connectionStatus.message;
		}
	);

	adapter.on("signalsAvailable", (available: boolean) => {
		isConnected.value = available;
	});

	const refreshConnection = () => {
		status.value = "connecting";
		message.value = "Connecting...";
		adapter.requestState();
	};

	return {
		status,
		message,
		isConnected,
		refreshConnection,
	};
});
