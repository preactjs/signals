# @preact/signals-remote

Prototype helpers for mirroring `@preact/signals-core` state across a transport boundary.

The package is transport-agnostic:

- publish individual signals
- publish flat models made of signals/computeds and actions
- invoke model actions through Promise-based RPC

## Installation

```bash
pnpm add @preact/signals-core @preact/signals-remote
```

## Signal Usage

```ts
import { effect } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
} from "@preact/signals-remote";

const server = createRemoteSignalServer();
const count = server.createSignal("count", 0);

const { server: serverTransport, client: clientTransport } =
	createRemoteTransportPair();

server.attach(serverTransport);

const client = createRemoteSignalClient(clientTransport);
const remoteCount = client.signal<number>("count");

effect(() => {
	if (remoteCount.ready.value) {
		console.log("remote count", remoteCount.value);
	}
});

count.value = 1;
count.value = 2;
```

## Model Usage

```ts
import { computed, createModel, signal } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
} from "@preact/signals-remote";

interface CounterModel {
	count: ReturnType<typeof signal<number>>;
	status: ReturnType<typeof computed<string>>;
	add(amount: number): number;
	reset(): void;
}

const server = createRemoteSignalServer();
const CounterModel = createModel<CounterModel>(() => {
	const count = signal(0);
	const status = computed(() => `count:${count.value}`);

	return {
		count,
		status,
		add(amount) {
			count.value += amount;
			return count.value;
		},
		reset() {
			count.value = 0;
		},
	};
});

const model = new CounterModel();
server.publishModel("counter", model);

const { server: serverTransport, client: clientTransport } =
	createRemoteTransportPair();

server.attach(serverTransport);

const client = createRemoteSignalClient(clientTransport);
const remoteCounter = client.model<CounterModel>("counter");

await remoteCounter.actions.add(2);

if (remoteCounter.ready.value && remoteCounter.state) {
	console.log(remoteCounter.state.count.value);
	console.log(remoteCounter.state.status.value);
}
```

## Type-only Contracts

If the server and client should not share runtime values across realms, define a contract type and import it with `import type` only:

```ts
// counter.contract.ts
import type { RemoteModelContract } from "@preact/signals-remote";
import type { WorkerCounterModel } from "./shared";

export type CounterContract = RemoteModelContract<
	"worker-counter",
	WorkerCounterModel
>;
```

```ts
// server
import type { CounterContract } from "./counter.contract";

server.publishModel<CounterContract>("worker-counter", model);
```

```ts
// client
import type { CounterContract } from "./counter.contract";

const remoteCounter = client.model<CounterContract>("worker-counter");
```

This keeps the key as the only runtime value while still deriving state and action types from a shared contract.

## API

### `createRemoteSignalServer()`

Creates a server registry that can publish signals and models.

- `createSignal(key, initialValue, options?)`
- `publish(key, source)`
- `unpublish(key)`
- `publishModel(key, model)`
- `unpublishModel(key)`
- `attach(transport)`

### `createRemoteSignalClient(transport)`

Creates a client registry that lazily subscribes to published remote state.

- `signal(key, options?)`
- `model(key)`
- `dispose()`

Each remote signal exposes:

- `value`
- `ready`
- `status`
- `error`
- `dispose()`

Each remote model exposes:

- `state`
- `ready`
- `status`
- `error`
- `actions` derived from the model's functions
- `dispose()`

### `createRemoteTransportPair()`

Creates an in-memory transport pair for tests, demos, and local prototyping.

## Adapting a WebSocket

You can wrap an existing socket by translating JSON messages into the package transport interface:

```ts
import type {
	RemoteSignalMessage,
	RemoteSignalTransport,
} from "@preact/signals-remote";

function createWebSocketTransport(socket: WebSocket): RemoteSignalTransport {
	return {
		send(message) {
			socket.send(JSON.stringify(message));
		},
		subscribe(listener) {
			const handleMessage = (event: MessageEvent<string>) => {
				listener(JSON.parse(event.data) as RemoteSignalMessage);
			};

			socket.addEventListener("message", handleMessage);

			return () => {
				socket.removeEventListener("message", handleMessage);
			};
		},
	};
}
```
