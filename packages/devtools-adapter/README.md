# @preact/signals-devtools-adapter

Communication adapters for the Preact Signals DevTools UI. This package provides abstraction layers that allow the DevTools UI to communicate with the signals debug system through various mechanisms.

## Installation

```bash
npm install @preact/signals-devtools-adapter
```

## Available Adapters

### BrowserExtensionAdapter

Used when the DevTools UI runs inside a browser extension (Chrome DevTools panel).

```typescript
import { createBrowserExtensionAdapter } from "@preact/signals-devtools-adapter";

const adapter = createBrowserExtensionAdapter();
await adapter.connect();
```

### DirectAdapter

Used when the DevTools UI is embedded directly in the same page as the signals (e.g., for demos, blog posts, or development overlays).

```typescript
import { createDirectAdapter } from "@preact/signals-devtools-adapter";

const adapter = createDirectAdapter({
	targetWindow: window, // optional
	pollInterval: 100, // optional, ms to poll for signals API
	maxWaitTime: 10000, // optional, max time to wait
});
await adapter.connect();
```

### PostMessageAdapter

Used for cross-window/iframe communication when the DevTools UI is in a different frame than the debugged page.

```typescript
import { createPostMessageAdapter } from "@preact/signals-devtools-adapter";

const adapter = createPostMessageAdapter({
	sourceWindow: window,
	sourceOrigin: "https://your-origin.com",
	targetWindow: parentWindow, // optional
	targetOrigin: "https://target-origin.com", // optional
});
await adapter.connect();
```

## Creating Custom Adapters

You can create custom adapters by extending the `BaseAdapter` class:

```typescript
import { BaseAdapter, type Settings } from "@preact/signals-devtools-adapter";

class MyCustomAdapter extends BaseAdapter {
	async connect(): Promise<void> {
		// Your connection logic
		this.setConnectionStatus({ status: "connected", message: "Connected" });
	}

	disconnect(): void {
		// Your cleanup logic
	}

	sendConfig(config: Settings): void {
		// Send configuration to debug system
	}

	requestState(): void {
		// Request current state
	}
}
```

## API

### DevToolsAdapter Interface

```typescript
interface DevToolsAdapter {
	connect(): Promise<void>;
	disconnect(): void;
	sendConfig(config: Settings): void;
	requestState(): void;
	on<K extends keyof AdapterEvents>(
		event: K,
		listener: AdapterEvents[K]
	): Unsubscribe;
	getConnectionStatus(): ConnectionStatus;
	isSignalsAvailable(): boolean;
}
```

### Events

- `signalUpdate` - Signal updates received from the debug system
- `signalInit` - Initialization signal from the debug system
- `signalsAvailable` - Signals availability changed
- `configReceived` - Configuration received from debug system
- `connectionStatusChanged` - Connection status changed

## License

MIT
