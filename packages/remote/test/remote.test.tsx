import { describe, expect, it } from "vitest";

import { effect } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
} from "@preact/signals-remote";

async function flushTransport() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("signals-remote", () => {
	it("mirrors snapshots and updates from the server", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		expect(remoteCount.ready.value).to.equal(false);

		await flushTransport();

		expect(remoteCount.ready.value).to.equal(true);
		expect(remoteCount.value).to.equal(0);

		count.value = 1;
		await flushTransport();

		expect(remoteCount.value).to.equal(1);
		expect(remoteCount.status.value).to.equal("ready");
	});

	it("notifies reactive client effects when the server signal changes", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 1);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");
		const observed: Array<number | undefined> = [];

		effect(() => {
			observed.push(remoteCount.value);
		});

		await flushTransport();
		count.value = 2;
		await flushTransport();

		expect(observed).to.deep.equal([undefined, 1, 2]);
	});

	it("stops forwarding updates after the client disposes the remote signal", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		await flushTransport();
		remoteCount.dispose();

		count.value = 1;
		await flushTransport();

		expect(remoteCount.status.value).to.equal("disposed");
		expect(remoteCount.value).to.equal(0);
	});

	it("surfaces missing signals as client errors", async () => {
		const server = createRemoteSignalServer();
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("missing");

		await flushTransport();

		expect(remoteCount.ready.value).to.equal(false);
		expect(remoteCount.status.value).to.equal("error");
		expect(remoteCount.error.value?.message).to.equal(
			"Unknown remote signal: missing"
		);
	});

	it("marks a mirrored signal as unpublished when the server removes it", async () => {
		const server = createRemoteSignalServer();
		server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		await flushTransport();
		server.unpublish("count");
		await flushTransport();

		expect(remoteCount.ready.value).to.equal(false);
		expect(remoteCount.status.value).to.equal("unpublished");
	});
});
