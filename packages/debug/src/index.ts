/* eslint-disable no-console */
import { Signal, Effect } from "@preact/signals-core";
import { formatValue, getSignalName } from "./utils";
import { UpdateInfo, Node, Computed } from "./internal";

const inflightUpdates = new Set<Signal>();
const updateInfoMap = new WeakMap<Signal, UpdateInfo[]>();
const trackers = new WeakMap<Signal, number>();
const activeSignals = new Set<Signal>();
const signalValues = new WeakMap<Signal, any>();
const subscriptions = new WeakMap<Signal, () => void>();

export function getDebugStats() {
	return {
		activeTrackers: activeSignals.size,
		activeSubscriptions: activeSignals.size,
	};
}

export function setDebugOptions(options: {
	grouped?: boolean;
	enabled?: boolean;
}) {
	if (typeof options.grouped === "boolean") isGrouped = options.grouped;
	if (typeof options.enabled === "boolean") debugEnabled = options.enabled;
}

let isGrouped = true,
	debugEnabled = true,
	initializing = false;

// Store original methods
const originalSubscribe = Signal.prototype._subscribe;
const originalUnsubscribe = Signal.prototype._unsubscribe;
// Track subscriptions for statistics
Signal.prototype._subscribe = function (node: Node) {
	if (initializing) return originalSubscribe.call(this, node);

	const tracker = trackers.get(this) || 0;
	trackers.set(this, tracker + 1);

	if (tracker === 0) {
		activeSignals.add(this);
		// Initialize tracked value and set up subscription for logging
		const initialValue = this.peek();
		signalValues.set(this, initialValue);

		// Set up a subscription to track value changes
		initializing = true;
		const unsubscribe = this.subscribe(newValue => {
			if (!debugEnabled) return;

			const prevValue = signalValues.get(this);
			if (prevValue !== newValue) {
				signalValues.set(this, newValue);

				if (!("_fn" in this)) {
					inflightUpdates.add(this);
					updateInfoMap.set(this, [
						{
							signal: this,
							prevValue,
							newValue,
							timestamp: Date.now(),
							depth: 0,
							type: "value",
						},
					]);
					queueMicrotask(() => {
						flushUpdates();
					});
				} else if ("_sources" in this) {
					const baseSignal = bubbleUpToBaseSignal(this as any);
					if (baseSignal) {
						const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
						updateInfoList.push({
							signal: this,
							prevValue,
							newValue,
							timestamp: Date.now(),
							depth: baseSignal.depth,
							type: "value",
						});
						updateInfoMap.set(baseSignal.signal, updateInfoList);
					}
				}
			}
		});
		initializing = false;

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

const originalEffectCallback = Effect.prototype._callback;
Effect.prototype._callback = function (node: Node) {
	if (!debugEnabled || this.internal)
		return originalEffectCallback.call(this, node);

	if ("_sources" in this) {
		const baseSignal = bubbleUpToBaseSignal(this as any);
		if (baseSignal) {
			const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
			updateInfoList.push({
				signal: this,
				timestamp: Date.now(),
				depth: baseSignal.depth,
				type: "effect",
			});
			updateInfoMap.set(baseSignal.signal, updateInfoList);
		}
	}

	return originalEffectCallback.call(this, node);
};

function flushUpdates() {
	const signals = Array.from(inflightUpdates);
	inflightUpdates.clear();

	for (const signal of signals) {
		const updateInfoList = updateInfoMap.get(signal) || [];
		let prevDepth = -1;
		for (const updateInfo of updateInfoList) {
			logUpdate(updateInfo, prevDepth);
			prevDepth = updateInfo.depth;
		}
		updateInfoMap.delete(signal);
		new Array(prevDepth + 1).fill(0).map(endUpdateGroup);
	}
}

/* eslint-disable no-console */
function logUpdate(info: UpdateInfo, prevDepth: number) {
	if (!debugEnabled) return;

	const { signal, type, depth } = info;
	const name = getSignalName(signal);

	if (type === "effect") {
		if (isGrouped)
			console.groupCollapsed(
				`${" ".repeat(depth * 2)}↪️ Triggered effect: ${name}`
			);
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
			console.group(`🎯 Signal Update: ${name}`);
		} else {
			console.groupCollapsed(
				`${" ".repeat(depth * 2)}↪️ Triggered update: ${name}`
			);
		}

		console.log(`${" ".repeat(depth * 2)}From:`, formattedPrev);
		console.log(`${" ".repeat(depth * 2)}To:`, formattedNew);

		if ("_fn" in signal) {
			console.log(`${" ".repeat(depth * 2)}Type: Computed`);
		}
	} else {
		console.log(
			`${depth === 0 ? "🎯" : "↪️"} ${name}: ${formattedPrev} → ${formattedNew}`
		);
	}
}

function endUpdateGroup() {
	if (debugEnabled && isGrouped) {
		console.groupEnd();
	}
}
/* eslint-enable no-console */
