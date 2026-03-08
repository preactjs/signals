import { batch } from "@preact/signals-core";

import {
	applyRemoteModelEntries,
	createRemoteModelRecord,
	createRemoteSignalRecord,
	type RemoteModelRecord,
	type RemoteSignalRecord,
} from "./internal";
import type {
	RemoteModel,
	RemoteSignal,
	RemoteSignalClient,
	RemoteSignalMessage,
	RemoteSignalOptions,
	RemoteSignalTransport,
} from "./types";

function rejectPendingCalls(record: RemoteModelRecord, error: Error) {
	for (const pending of record.pendingCalls.values()) {
		pending.reject(error);
	}

	record.pendingCalls.clear();
}

export function createRemoteSignalClient(
	transport: RemoteSignalTransport
): RemoteSignalClient {
	const remotes = new Map<string, RemoteSignalRecord<unknown>>();
	const models = new Map<string, RemoteModelRecord>();

	const stop = transport.subscribe(message => {
		handleSignalMessage(remotes, message);
		handleModelMessage(models, message);
	});

	function disposeRemoteSignal(key: string) {
		const record = remotes.get(key);
		if (record === undefined) {
			return;
		}

		remotes.delete(key);
		record.ready.value = false;
		record.error.value = undefined;
		record.status.value = "disposed";
		transport.send({ type: "unsubscribe", key });
	}

	function disposeRemoteModel(key: string) {
		const record = models.get(key);
		if (record === undefined) {
			return;
		}

		models.delete(key);
		record.ready.value = false;
		record.status.value = "disposed";
		record.error.value = undefined;
		rejectPendingCalls(
			record,
			new Error(`Remote model '${key}' was disposed.`)
		);
		transport.send({ type: "unsubscribe-model", key });
	}

	function callRemoteModelAction(
		key: string,
		action: string,
		args: unknown[]
	): Promise<unknown> {
		const record = models.get(key);
		if (record === undefined) {
			return Promise.reject(new Error(`Unknown remote model: ${key}`));
		}

		const callId = record.nextCallId++;

		return new Promise((resolve, reject) => {
			record.pendingCalls.set(callId, { resolve, reject });
			transport.send({
				type: "call-model-action",
				key,
				action,
				args,
				callId,
			});
		});
	}

	return {
		signal<T>(key: string, options?: RemoteSignalOptions<T>): RemoteSignal<T> {
			const existing = remotes.get(key);
			if (existing !== undefined) {
				return existing.remote as RemoteSignal<T>;
			}

			const record = createRemoteSignalRecord(
				key,
				() => {
					disposeRemoteSignal(key);
				},
				options
			);

			remotes.set(key, record as RemoteSignalRecord<unknown>);
			transport.send({ type: "subscribe", key });
			return record.remote;
		},
		model<TModel, TActions = {}>(key: string): RemoteModel<TModel, TActions> {
			const existing = models.get(key);
			if (existing !== undefined) {
				return existing.remote as RemoteModel<TModel, TActions>;
			}

			const record = createRemoteModelRecord<TModel, TActions>(
				key,
				() => {
					disposeRemoteModel(key);
				},
				(action, args) => callRemoteModelAction(key, action, args)
			);

			models.set(key, record);
			transport.send({ type: "subscribe-model", key });
			return record.remote;
		},
		dispose() {
			stop();

			for (const key of Array.from(remotes.keys())) {
				disposeRemoteSignal(key);
			}

			for (const key of Array.from(models.keys())) {
				disposeRemoteModel(key);
			}
		},
	};
}

function handleSignalMessage(
	remotes: Map<string, RemoteSignalRecord<unknown>>,
	message: RemoteSignalMessage
) {
	const record = remotes.get(message.key);
	if (record === undefined) {
		return;
	}

	if (message.type === "snapshot" || message.type === "update") {
		if (message.version < record.version) {
			return;
		}

		record.version = message.version;
		record.value.value = message.value;
		record.ready.value = true;
		record.error.value = undefined;
		record.status.value = "ready";
		return;
	}

	if (message.type === "error") {
		record.ready.value = false;
		record.error.value = new Error(message.message);
		record.status.value = "error";
		return;
	}

	if (message.type === "unpublished") {
		record.ready.value = false;
		record.error.value = undefined;
		record.status.value = "unpublished";
	}
}

function handleModelMessage(
	models: Map<string, RemoteModelRecord>,
	message: RemoteSignalMessage
) {
	const record = models.get(message.key);
	if (record === undefined) {
		return;
	}

	if (message.type === "model-snapshot") {
		if (message.version < record.version) {
			return;
		}

		batch(() => {
			record.version = message.version;
			applyRemoteModelEntries(record, message.entries);
			record.ready.value = true;
			record.error.value = undefined;
			record.status.value = "ready";
		});
		return;
	}

	if (message.type === "model-patch") {
		if (message.version < record.version) {
			return;
		}

		batch(() => {
			record.version = message.version;
			applyRemoteModelEntries(record, message.updates);
			record.ready.value = true;
			record.error.value = undefined;
			record.status.value = "ready";
		});
		return;
	}

	if (message.type === "model-error") {
		record.ready.value = false;
		record.error.value = new Error(message.message);
		record.status.value = "error";
		rejectPendingCalls(record, new Error(message.message));
		return;
	}

	if (message.type === "model-unpublished") {
		record.ready.value = false;
		record.error.value = undefined;
		record.status.value = "unpublished";
		rejectPendingCalls(
			record,
			new Error(`Remote model '${message.key}' is no longer published.`)
		);
		return;
	}

	if (message.type === "model-action-result") {
		const pending = record.pendingCalls.get(message.callId);
		if (pending === undefined) {
			return;
		}

		record.pendingCalls.delete(message.callId);
		record.error.value = undefined;
		pending.resolve(message.value);
		return;
	}

	if (message.type === "model-action-error") {
		const pending = record.pendingCalls.get(message.callId);
		if (pending === undefined) {
			return;
		}

		record.pendingCalls.delete(message.callId);
		const error = new Error(message.message);
		record.error.value = error;
		pending.reject(error);
	}
}
