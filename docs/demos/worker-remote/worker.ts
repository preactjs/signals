/// <reference lib="webworker" />

import { computed } from "@preact/signals-core";
import {
	createRemoteSignalServer,
	type RemoteSignalTransport,
} from "@preact/signals-remote";

import type { WorkerCommand, WorkerEnvelope } from "./shared";

declare const self: DedicatedWorkerGlobalScope;

const server = createRemoteSignalServer();
const count = server.createSignal("count", 0, { name: "worker-count" });
const ticking = server.createSignal("ticking", false, {
	name: "worker-ticking",
});
const updatedAt = server.createSignal("updatedAt", formatTime(), {
	name: "worker-updated-at",
});

const status = computed(
	() =>
		ticking.value
			? `Worker timer running - pushed count ${count.value}`
			: `Worker idle - last count ${count.value}`,
	{ name: "worker-status" }
);

server.publish("status", status);

const transport: RemoteSignalTransport = {
	send(message) {
		self.postMessage({ kind: "remote", message } satisfies WorkerEnvelope);
	},
	subscribe(listener) {
		const handleMessage = (event: MessageEvent<WorkerEnvelope>) => {
			if (event.data?.kind === "remote") {
				listener(event.data.message);
			}
		};

		self.addEventListener("message", handleMessage as EventListener);

		return () => {
			self.removeEventListener("message", handleMessage as EventListener);
		};
	},
};

server.attach(transport);

let timer: ReturnType<typeof setInterval> | undefined;

function formatTime() {
	return new Date().toLocaleTimeString();
}

function stamp() {
	updatedAt.value = formatTime();
}

function setCount(next: number) {
	count.value = next;
	stamp();
}

function start() {
	if (timer !== undefined) {
		return;
	}

	ticking.value = true;
	stamp();
	timer = setInterval(() => {
		count.value += 1;
		stamp();
	}, 1000);
}

function stop() {
	if (timer === undefined) {
		return;
	}

	clearInterval(timer);
	timer = undefined;
	ticking.value = false;
	stamp();
}

function handleCommand(command: WorkerCommand) {
	switch (command.type) {
		case "increment":
			setCount(count.value + 1);
			break;
		case "decrement":
			setCount(count.value - 1);
			break;
		case "randomize":
			setCount(Math.floor(Math.random() * 100));
			break;
		case "start":
			start();
			break;
		case "stop":
			stop();
			break;
		case "reset":
			stop();
			setCount(0);
			break;
	}
}

self.addEventListener("message", (event: MessageEvent<WorkerEnvelope>) => {
	if (event.data?.kind === "command") {
		handleCommand(event.data.command);
	}
});

export {};
