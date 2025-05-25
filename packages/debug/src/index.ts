import { Signal, Effect } from "@preact/signals-core";
import { formatValue } from "./utils";
import { getSignalName } from "./utils";

/**
 * The ideal way this works:
 *
 * - [x] We receive an update in our subscribe callback
 * - [x] When the subscribe callback is called with a Signal
 *   - [x] We set an entry in a WeakMap where we track signal --> UpdateInfo[]
 *   - [x] We set an entry in a Set where we track the base-signals that are part of this (batched) update
 * - [x] When the subscribe callback is called with a Computed we bubble up until we find the base-signal
 *   - [x] We add an update to the UpdateInfo[] for the base-signal
 * - [x] When an effect is updated we could fan out into multiple signal-updates again
 *   - [x] We add an update to the UpdateInfo[] for the base-signal
 *   - [x] ISSUE: Effect is not exposed from the base implementation, so we need to find a way to get to it.
 *   - [x] ISSUE: Effect is used as a primitive so any computed/signal that runs will have an effect associated with it.
 * - [x] When the batch ends, we clear the Set and the WeakMap and log all updates
 * - [ ] Future: Add a babel plugin that shoe-horns in a name for the signal when none is present with the variable declaration
 *       or something inside of the effect I reckon
 * - [ ] Improve indentation for base-signal updates
 */

type Node = {
	_source: Signal;
	_prevSource?: Node;
	_nextSource?: Node;
	_target: any; // Computed or Effect - using any to avoid type issues
	_prevTarget?: Node;
	_nextTarget?: Node;
	_version: number;
	_rollbackNode?: Node;
};

type UpdateInfo = ValueUpdate | EffectUpdate;

interface ValueUpdate {
	type: "value";
	signal: Signal;
	prevValue: any;
	newValue: any;
	timestamp: number;
	depth: number;
}

interface EffectUpdate {
	type: "effect";
	timestamp: number;
	signal: Signal;
	depth: number;
}

const inflightUpdates = new Set<Signal>();
const updateInfoMap = new WeakMap<Signal, UpdateInfo[]>();
const trackers = new WeakMap<Signal, number>();
const activeSignals = new Set<Signal>();
const signalValues = new WeakMap<Signal, any>();
const subscriptions = new WeakMap<Signal, () => void>();

let isGrouped = true;
let debugEnabled = true;

export function setDebugOptions(options: {
	grouped?: boolean;
	enabled?: boolean;
}) {
	if (typeof options.grouped === "boolean") isGrouped = options.grouped;
	if (typeof options.enabled === "boolean") debugEnabled = options.enabled;
}

function logUpdate(info: UpdateInfo, prevDepth: number) {
	if (!debugEnabled) return;

	const { signal, type, depth } = info;
	const name = getSignalName(signal);

	if (type === "effect") {
		if (isGrouped)
			// eslint-disable-next-line no-console
			console.groupCollapsed(
				`${" ".repeat(depth * 2)}↪️ Triggered effect: ${name}`
			);
		// eslint-disable-next-line no-console
		else console.log(`${" ".repeat(depth * 2)}↪️ Triggered effect: ${name}`);
		return;
	}

	const formattedPrev = formatValue(info.prevValue);
	const formattedNew = formatValue(info.newValue);

	if (isGrouped) {
		if (prevDepth === depth) {
			endUpdateGroup();
		}

		if (depth === 0) {
			// eslint-disable-next-line no-console
			console.group(`🎯 Signal Update: ${name}`);
		} else {
			// eslint-disable-next-line no-console
			console.groupCollapsed(
				`${" ".repeat(depth * 2)}↪️ Triggered update: ${name}`
			);
		}

		// eslint-disable-next-line no-console
		console.log(`${" ".repeat(depth * 2)}From:`, formattedPrev);
		// eslint-disable-next-line no-console
		console.log(`${" ".repeat(depth * 2)}To:`, formattedNew);

		if ("_fn" in signal) {
			// eslint-disable-next-line no-console
			console.log(`${" ".repeat(depth * 2)}Type: Computed`);
		}
	} else {
		// eslint-disable-next-line no-console
		console.log(
			`${depth === 0 ? "🎯" : "↪️"} ${name}: ${formattedPrev} → ${formattedNew}`
		);
	}
}

function endUpdateGroup() {
	if (debugEnabled && isGrouped) {
		// eslint-disable-next-line no-console
		console.groupEnd();
	}
}

function flushUpdates() {
	for (const signal of inflightUpdates) {
		const updateInfoList = updateInfoMap.get(signal) || [];
		// TODO: we'll need to sort and form an escalator type of logging
		let prevDepth = -1;
		for (const updateInfo of updateInfoList) {
			logUpdate(updateInfo, prevDepth);
			prevDepth = updateInfo.depth;
		}

		new Array(prevDepth + 1).fill(0).map(endUpdateGroup);
	}
	inflightUpdates.clear();
}

interface Computed extends Signal {
	_sources?: Node;
}

function hasUpdateEntry(signal: Signal) {
	const inFlightUpdate = updateInfoMap.get(signal);
	if (
		inFlightUpdate &&
		!inFlightUpdate.find(updateInfo => updateInfo.signal === signal)
	) {
		return true;
	}
	return false;
}

function bubbleUpToBaseSignal(
	node: Computed,
	depth = 1
): { signal: Signal; depth: number } | null {
	if (!("_sources" in node)) {
		return null;
	}

	if (
		inflightUpdates.has(node._sources?._source as Signal) &&
		!hasUpdateEntry(node._sources?._source as Signal)
	) {
		return { signal: node._sources?._source as Signal, depth };
	}

	while (node._sources?._nextSource) {
		node = node._sources?._nextSource as any;
		if (
			"_source" in node &&
			inflightUpdates.has(node._source as Signal) &&
			!hasUpdateEntry(node._source as Signal)
		) {
			return { signal: node._source as Signal, depth };
		}
	}

	if (node._sources?._source) {
		return bubbleUpToBaseSignal(node._sources?._source as any, depth + 1);
	}

	return null;
}

// Store original methods
const originalSubscribe = Signal.prototype._subscribe;
const originalUnsubscribe = Signal.prototype._unsubscribe;
// Track subscriptions for statistics
Signal.prototype._subscribe = function (node: Node) {
	const tracker = trackers.get(this) || 0;
	trackers.set(this, tracker + 1);

	if (tracker === 0) {
		activeSignals.add(this);
		// Initialize tracked value and set up subscription for logging
		const initialValue = this.peek();
		signalValues.set(this, initialValue);

		// Set up a subscription to track value changes
		const unsubscribe = this.subscribe(newValue => {
			if (!debugEnabled) return;

			const prevValue = signalValues.get(this);
			if (prevValue !== newValue) {
				signalValues.set(this, newValue);

				const updateInfo: UpdateInfo = {
					signal: this,
					prevValue,
					newValue,
					timestamp: Date.now(),
					depth: 0,
					type: "value",
				};

				if (!("_fn" in this)) {
					inflightUpdates.add(this);
					updateInfoMap.set(this, [updateInfo]);
					queueMicrotask(() => {
						flushUpdates();
					});
				} else if ("_sources" in this) {
					const baseSignal = bubbleUpToBaseSignal(this as any);
					if (baseSignal) {
						const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
						updateInfoList.push(updateInfo);
						updateInfoMap.set(baseSignal.signal, updateInfoList);
						updateInfo.depth = baseSignal.depth;
					}
				}
			}
		});

		subscriptions.set(this, unsubscribe);
	}

	return originalSubscribe.call(this, node);
};

Signal.prototype._unsubscribe = function (node: Node) {
	const tracker = trackers.get(this) || 0;
	if (tracker > 0) {
		trackers.set(this, tracker - 1);

		if (tracker === 1) {
			activeSignals.delete(this);
			signalValues.delete(this);
			trackers.delete(this);

			// Clean up our debug subscription
			const unsubscribe = subscriptions.get(this);
			if (unsubscribe) {
				unsubscribe();
				subscriptions.delete(this);
			}
		}
	}

	return originalUnsubscribe.call(this, node);
};

export function getDebugStats() {
	return {
		activeTrackers: activeSignals.size,
		activeSubscriptions: activeSignals.size,
	};
}

const originalEffectCallback = Effect.prototype._callback;
Effect.prototype._callback = function (node: Node) {
	if (!debugEnabled || this.internal)
		return originalEffectCallback.call(this, node);

	const updateInfo: UpdateInfo = {
		signal: this,
		timestamp: Date.now(),
		depth: 0,
		type: "effect",
	};

	if ("_sources" in this) {
		const baseSignal = bubbleUpToBaseSignal(this as any);
		if (baseSignal) {
			const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
			updateInfoList.push(updateInfo);
			updateInfoMap.set(baseSignal.signal, updateInfoList);
			updateInfo.depth = baseSignal.depth;
		}
	}

	return originalEffectCallback.call(this, node);
};
