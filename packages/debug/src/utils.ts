import { Effect, Signal } from "@preact/signals-core";

export function getSignalName(signal: any, isEffect: boolean): string {
	// Try to get a meaningful name for the signal
	if (signal.displayName) return signal.displayName;
	if (signal.name)
		return signal.name === "sub"
			? `${(signal as Effect)._sources?._source.name}-subscribe`
			: signal.name;
	if (signal._fn && signal._fn.name) return signal._fn.name;
	if (isEffect) return "effect";
	const signalType = "_fn" in signal ? "computed" : "signal";
	return `(anonymous ${signalType})`;
}

export function formatValue(value: any): string {
	try {
		if (typeof value !== "object" || value === null) {
			return String(value);
		}

		// Handle circular references with a replacer function
		const seen = new WeakSet();
		return JSON.stringify(value, (key, val) => {
			if (typeof val === "bigint") {
				return val.toString();
			}
			if (typeof val === "object" && val !== null) {
				if (seen.has(val)) {
					return "[Circular]";
				}
				seen.add(val);
			}
			return val;
		});
	} catch {
		return "(unstringifiable value)";
	}
}

export function getSignalId(signal: Signal | Effect): string {
	if (!(signal as any)._debugId) {
		(signal as any)._debugId =
			`signal_${Math.random().toString(36).substring(2, 9)}`;
	}
	return (signal as any)._debugId;
}
