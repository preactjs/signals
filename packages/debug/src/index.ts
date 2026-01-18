/* eslint-disable no-console */
import { Signal, Effect, Computed, effect } from "@preact/signals-core";
import { formatValue, getSignalName } from "./utils";
import { UpdateInfo, Node, Computed as ComputedType } from "./internal";
import { getExtensionBridge } from "./extension-bridge";
import "./devtools"; // Initialize DevTools integration

const inflightUpdates = new Set<Signal | Effect>();
const updateInfoMap = new WeakMap<Signal | Effect, UpdateInfo[]>();
const trackers = new WeakMap<Signal | Effect, number>();
const signalValues = new WeakMap<Signal | Effect, any>();
const subscriptions = new WeakMap<Signal | Effect, () => void>();
const internalEffects = new WeakSet<Effect>();
const signalDependencies = new WeakMap<Signal | Effect, Set<string>>(); // Track what each signal depends on

export function setDebugOptions(options: {
	grouped?: boolean;
	enabled?: boolean;
	spacing?: number;
}) {
	if (typeof options.grouped === "boolean") isGrouped = options.grouped;
	if (typeof options.enabled === "boolean") debugEnabled = options.enabled;
	if (typeof options.spacing === "number") spacing = options.spacing;
}

let isGrouped = true,
	debugEnabled = true,
	initializing = false,
	spacing = 0;

function getSignalId(signal: Signal | Effect): string {
	if (!(signal as any)._debugId) {
		(signal as any)._debugId =
			`signal_${Math.random().toString(36).substr(2, 9)}`;
	}
	return (signal as any)._debugId;
}

function trackDependency(target: Signal | Effect, source: Signal | Effect) {
	const sourceId = getSignalId(source);

	if (!signalDependencies.has(target)) {
		signalDependencies.set(target, new Set());
	}
	signalDependencies.get(target)?.add(sourceId);
}

// Store original methods
const originalSubscribe = Signal.prototype._subscribe;
const originalUnsubscribe = Signal.prototype._unsubscribe;
// Track subscriptions for statistics
Signal.prototype._subscribe = function (node: Node) {
	if (initializing) return originalSubscribe.call(this, node);

	const tracker = trackers.get(this) || 0;
	trackers.set(this, tracker + 1);

	if (tracker === 0 && !("_fn" in this)) {
		// Initialize tracked value and set up subscription for logging
		const initialValue = this.peek();
		signalValues.set(this, initialValue);
		const sig = this as Signal;

		// Set up a subscription to track value changes
		initializing = true;
		let internalEffect: Effect | undefined;
		const unsubscribe = effect(function (this: Effect) {
			internalEffect = this;
			const newValue = sig.value;
			const prevValue = signalValues.get(sig);

			if (!debugEnabled) return;

			if (prevValue !== newValue) {
				signalValues.set(sig, newValue);
				inflightUpdates.add(sig);
				updateInfoMap.set(sig, [
					{
						signal: sig,
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
			}
		});
		initializing = false;

		subscriptions.set(sig, () => {
			unsubscribe();
			internalEffect && internalEffects.delete(internalEffect);
		});
	}

	return originalSubscribe.call(this, node);
};

const originalRefresh = Computed.prototype._refresh;
Computed.prototype._refresh = function () {
	const prevValue = this._value;
	const result = originalRefresh.call(this);
	const newValue = this._value;
	const baseSignal = bubbleUpToBaseSignal(this as any);
	if (baseSignal && prevValue !== newValue) {
		// Track dependency
		trackDependency(this, baseSignal.signal);

		const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
		updateInfoList.push({
			signal: this,
			prevValue,
			newValue,
			timestamp: Date.now(),
			depth: baseSignal.depth,
			type: "value",
			subscribedTo: getSignalId(baseSignal.signal),
		});
		updateInfoMap.set(baseSignal.signal, updateInfoList);
	}

	return result;
};

Signal.prototype._unsubscribe = function (node: Node) {
	const tracker = trackers.get(this) || 0;
	if (tracker > 0) {
		trackers.set(this, tracker - 1);

		if (tracker === 1) {
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
	node: ComputedType,
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

Effect.prototype._debugCallback = function (this: Effect) {
	if (!debugEnabled || internalEffects.has(this)) return;

	if ("_sources" in this) {
		const baseSignal = bubbleUpToBaseSignal(this as any);
		if (baseSignal) {
			// Track dependency
			trackDependency(this, baseSignal.signal);

			const updateInfoList = updateInfoMap.get(baseSignal.signal) || [];
			updateInfoList.push({
				signal: this,
				timestamp: Date.now(),
				depth: baseSignal.depth,
				type: "effect",
				subscribedTo: getSignalId(baseSignal.signal),
			});
			updateInfoMap.set(baseSignal.signal, updateInfoList);
		}
	}
};

const originalEffectCallback = Effect.prototype._callback;
Effect.prototype._callback = function (this: Effect) {
	if (!debugEnabled || internalEffects.has(this))
		return originalEffectCallback.call(this);

	this._debugCallback!();

	return originalEffectCallback.call(this);
};

function flushUpdates() {
	const signals = Array.from(inflightUpdates);
	inflightUpdates.clear();
	const bridge = getExtensionBridge();

	for (const signal of signals) {
		const updateInfoList = updateInfoMap.get(signal) || [];

		// Send updates to Chrome DevTools extension with filtering and throttling
		if (typeof window !== "undefined" && !bridge.shouldThrottleUpdate()) {
			// Filter updates based on signal names
			const filteredUpdates = updateInfoList.filter(updateInfo => {
				const signalName = getSignalName(updateInfo.signal);
				return bridge.matchesFilter(signalName);
			});

			if (
				filteredUpdates.length > 0 &&
				(window as any).__PREACT_SIGNALS_DEVTOOLS__
			) {
				(window as any).__PREACT_SIGNALS_DEVTOOLS__.sendUpdate?.(
					filteredUpdates
				);
			}
		}

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

		console.log(`${" ".repeat(depth * spacing)}From:`, formattedPrev);
		console.log(`${" ".repeat(depth * spacing)}To:`, formattedNew);

		if ("_fn" in signal) {
			console.log(`${" ".repeat(depth * spacing)}Type: Computed`);
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

// Export extension utilities
export type { ExtensionConfig } from "./extension-bridge";
