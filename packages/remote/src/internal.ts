import { signal, type ReadonlySignal, type Signal } from "@preact/signals-core";

import type {
	RemoteModel,
	RemoteModelActions,
	RemoteModelEntry,
	RemoteModelState,
	RemoteSignal,
	RemoteSignalOptions,
	RemoteSignalStatus,
} from "./types";

const SIGNAL_BRAND = Symbol.for("preact-signals");

export type RemoteSignalRecord<T> = {
	remote: RemoteSignal<T>;
	value: Signal<T | undefined>;
	status: Signal<RemoteSignalStatus>;
	error: Signal<Error | undefined>;
	version: number;
};

export type PendingRemoteCall = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

type InternalRemoteModel<TModel, TActions> = RemoteModel<TModel, TActions> & {
	state: RemoteModelState<TModel> | undefined;
};

export type RemoteModelRecord<TModel = unknown, TActions = {}> = {
	remote: InternalRemoteModel<TModel, TActions>;
	status: Signal<RemoteSignalStatus>;
	error: Signal<Error | undefined>;
	leaves: Map<string, Signal<unknown>>;
	pendingCalls: Map<number, PendingRemoteCall>;
	nextCallId: number;
	version: number;
	state: RemoteModelState<TModel> | undefined;
};

export type PublishedModelLeaf = {
	key: string;
	source: ReadonlySignal<unknown>;
};

export type PublishedModel = {
	leaves: PublishedModelLeaf[];
	actions: Record<string, (...args: unknown[]) => unknown>;
};

export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function isReadonlySignal(
	value: unknown
): value is ReadonlySignal<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		((value as ReadonlySignal<unknown>).brand as symbol) === SIGNAL_BRAND &&
		typeof (value as ReadonlySignal<unknown>).subscribe === "function"
	);
}

export function collectPublishedModelLeaves(
	key: string,
	model: object
): PublishedModelLeaf[] {
	const leaves: PublishedModelLeaf[] = [];

	for (const property of Object.keys(model)) {
		const value = (model as Record<string, unknown>)[property];

		if (typeof value === "function") {
			continue;
		}

		if (isReadonlySignal(value)) {
			leaves.push({ key: property, source: value });
			continue;
		}

		throw new Error(
			`Remote model '${key}' contains an unsupported value at '${property}'. Remote models must be flat objects of signals and functions.`
		);
	}

	return leaves;
}

export function collectPublishedModelActions(
	model: object
): Record<string, (...args: unknown[]) => unknown> {
	const actions: Record<string, (...args: unknown[]) => unknown> = {};

	for (const key of Object.keys(model)) {
		const value = (model as Record<string, unknown>)[key];
		if (typeof value === "function") {
			actions[key] = value as (...args: unknown[]) => unknown;
		}
	}

	return actions;
}

export function createRemoteSignalRecord<T>(
	key: string,
	onDispose: () => void,
	options?: RemoteSignalOptions<T>
): RemoteSignalRecord<T> {
	const value = signal<T | undefined>(options?.initialValue);
	const status = signal<RemoteSignalStatus>("connecting");
	const error = signal<Error | undefined>(undefined);

	const remote = Object.assign(value, {
		key,
		status,
		error,
		dispose: onDispose,
	}) as RemoteSignal<T>;

	return {
		remote,
		value,
		status,
		error,
		version: -1,
	};
}

export function createRemoteModelRecord<TModel, TActions>(
	key: string,
	onDispose: () => void,
	callAction: (action: string, args: unknown[]) => Promise<unknown>
): RemoteModelRecord<TModel, TActions> {
	const status = signal<RemoteSignalStatus>("connecting");
	const error = signal<Error | undefined>(undefined);
	const actionCache: Record<string, (...args: unknown[]) => Promise<unknown>> =
		{};

	const actions = new Proxy(actionCache as RemoteModelActions<TActions>, {
		get(_target, property) {
			if (typeof property !== "string") {
				return undefined;
			}

			if (actionCache[property] === undefined) {
				actionCache[property] = (...args: unknown[]) =>
					callAction(property, args);
			}

			return actionCache[property];
		},
	});

	const remote: InternalRemoteModel<TModel, TActions> = {
		key,
		status,
		error,
		actions,
		state: undefined,
		dispose: onDispose,
	};

	return {
		remote,
		status,
		error,
		leaves: new Map(),
		pendingCalls: new Map(),
		nextCallId: 0,
		version: -1,
		state: undefined,
	};
}

export function applyRemoteModelEntries<TModel>(
	record: RemoteModelRecord<TModel>,
	entries: RemoteModelEntry[]
) {
	if (record.state === undefined) {
		record.state = {} as RemoteModelState<TModel>;
		record.remote.state = record.state;
	}

	for (const entry of entries) {
		let leaf = record.leaves.get(entry.key);

		if (leaf === undefined) {
			leaf = signal(entry.value);
			record.leaves.set(entry.key, leaf);
			(record.state as Record<string, unknown>)[entry.key] = leaf;
		} else {
			leaf.value = entry.value;
		}
	}
}
