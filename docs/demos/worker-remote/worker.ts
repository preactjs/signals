/// <reference lib="webworker" />

import {
	createRemoteSignalServer,
	type RemoteSignalMessage,
	type RemoteSignalTransport,
} from "@preact/signals-remote";

import { workerCounterRemote } from "./contract";
import { WorkerCounterModel } from "./model";

declare const self: DedicatedWorkerGlobalScope;

const server = createRemoteSignalServer();
const model = new WorkerCounterModel();

server.publishModel(workerCounterRemote, model);

const transport: RemoteSignalTransport = {
	send(message) {
		self.postMessage(message);
	},
	subscribe(listener) {
		const handleMessage = (event: MessageEvent<RemoteSignalMessage>) => {
			listener(event.data);
		};

		self.addEventListener("message", handleMessage as EventListener);

		return () => {
			self.removeEventListener("message", handleMessage as EventListener);
		};
	},
};

server.attach(transport);

export {};
