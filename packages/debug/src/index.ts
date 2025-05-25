import { Signal } from "../../core/src/index";

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
					depth: currentUpdateDepth,
				};

				updateStack.push(updateInfo);
				logUpdate(updateInfo);

				// Increase depth for any cascading updates
				currentUpdateDepth++;

				// Use Promise.resolve() - this is a hack and should
				// be solved in a synchronous way. I fear for this to
				// interfere with `batch()` which updates multiple signals
				Promise.resolve().then(() => {
					// Find and remove this update from the stack
					const index = updateStack.indexOf(updateInfo);
					if (index !== -1) {
						updateStack.splice(index, 1);
						endUpdateGroup();
					}
					if (currentUpdateDepth > 0) {
						currentUpdateDepth--;
					}
				});
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
		updateStackDepth: updateStack.length,
	};
}
