import {
	Signal,
	addOuterBatchEndCallback,
	removeOuterBatchEndCallback,
	batchDepth as coreBatchDepth,
} from "../../core/src/index";

/**
 * The ideal way this works:
 *
 * - We receive an update in our subscribe callback
 * - When the subscribe callback is called with a Signal
 *   - We set an entry in a WeakMap where we track signal --> UpdateInfo[]
 *   - We set an entry in a Set where we track the base-signals that are part of this (batched) update
 * - When the subscribe callback is called with a Computed we bubble up until we find the base-signal
 *   - We add an update to the UpdateInfo[] for the base-signal
 *   - ISSUE: how do we get to this base-signal reliably? Computeds can be built from multiple signals, and we need to find the base-signal that is being updated.
 * - When an effect is updated we could fan out into multiple signal-updates again
 *   - We add an update to the UpdateInfo[] for the base-signal
 *   - ISSUE: Effect is not exposed from the base implementation, so we need to find a way to get to it.
 * - When the batch ends, we clear the Set and the WeakMap and log all updates
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

interface UpdateInfo {
	signal: Signal;
	prevValue: any;
	newValue: any;
	timestamp: number;
	depth: number;
}

const updateStack: UpdateInfo[] = [];
const trackers = new WeakMap<Signal, number>();
const activeSignals = new Set<Signal>();
const signalValues = new WeakMap<Signal, any>();
const subscriptions = new WeakMap<Signal, () => void>();
let currentUpdateDepth = 0;
let isBatchCallbackRegistered = false;

let isGrouped = true;
let debugEnabled = true;

export function setDebugOptions(options: {
	grouped?: boolean;
	enabled?: boolean;
}) {
	if (typeof options.grouped === "boolean") isGrouped = options.grouped;
	if (typeof options.enabled === "boolean") debugEnabled = options.enabled;
}

function getSignalName(signal: Signal): string {
	return signal.name || "(anonymous signal)";
}

function formatValue(value: any): string {
	try {
		return typeof value === "object" ? JSON.stringify(value) : String(value);
	} catch {
		return "(unstringifiable value)";
	}
}

function logUpdate(info: UpdateInfo) {
	if (!debugEnabled) return;

	const { signal, prevValue, newValue, depth } = info;
	const name = getSignalName(signal);
	const formattedPrev = formatValue(prevValue);
	const formattedNew = formatValue(newValue);

	if (isGrouped) {
		if (depth === 0) {
			// eslint-disable-next-line no-console
			console.group(`🎯 Signal Update: ${name}`);
		} else {
			// eslint-disable-next-line no-console
			console.group(`${" ".repeat(depth * 2)}↪️ Triggered update: ${name}`);
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

		// If this is a root update and not in a batch, and not grouped, we might want to end the group immediately.
		// However, the main logic for group ending is now tied to batch completion for grouped logs.
		if (!isGrouped && depth === 0) {
			// For non-grouped, non-batched root updates, there's no explicit group to end here
			// as groups are only created if isGrouped is true.
		}
	}
}

function endUpdateGroup() {
	if (debugEnabled && isGrouped) {
		// eslint-disable-next-line no-console
		console.groupEnd();
	}
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
					depth: coreBatchDepth > 0 ? currentUpdateDepth : 0,
				};

				updateStack.push(updateInfo);
				logUpdate(updateInfo);

				// Increase depth for any cascading updates only if we are inside a batch
				if (coreBatchDepth > 0) {
					currentUpdateDepth++;
				}
			}
		});

		subscriptions.set(this, unsubscribe);

		if (!isBatchCallbackRegistered && activeSignals.size > 0) {
			addOuterBatchEndCallback(handleBatchEnd);
			isBatchCallbackRegistered = true;
		}
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

			if (isBatchCallbackRegistered && activeSignals.size === 0) {
				removeOuterBatchEndCallback(handleBatchEnd);
				isBatchCallbackRegistered = false;
				// Reset update stack and depth when no signals are active
				while (updateStack.length > 0) {
					endUpdateGroup();
					updateStack.pop();
				}
				currentUpdateDepth = 0;
			}
		}
	}

	return originalUnsubscribe.call(this, node);
};

function handleBatchEnd() {
	if (!debugEnabled || !isGrouped) return;

	// Process the stack from the most recent update
	// End groups for all updates that were part of this completed batch.
	// We identify these as updates that were logged when coreBatchDepth was > 0,
	// or root-level updates if the stack is now being cleared outside a batch context explicitly.
	let i = updateStack.length - 1;
	while (i >= 0) {
		// const update = updateStack[i]; // This line is removed as 'update' is not used
		// If the update's depth suggests it was part of a batch or it's a root update being cleared,
		// and considering currentUpdateDepth reflects the nesting at the time of logging.
		// The key is that `endUpdateGroup` is called for each logged group.
		endUpdateGroup();
		i--;
	}
	// Clear the stack after processing
	updateStack.length = 0;
	currentUpdateDepth = 0; // Reset depth after the batch completes
}

export function getDebugStats() {
	return {
		activeTrackers: activeSignals.size,
		activeSubscriptions: activeSignals.size,
		updateStackDepth: updateStack.length,
	};
}
