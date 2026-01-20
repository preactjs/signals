import { Effect, Signal } from "@preact/signals-core";

export function getSignalName(signal: Signal | Effect): string {
	const name = signal.name;
	if (name === "sub") {
		return `${(signal as Effect)._sources?._source.name}-subscribe`;
	}
	return name || "(anonymous signal)";
}

export function formatValue(value: any): string {
	try {
		if (typeof value !== "object" || value === null) {
			return String(value);
		}

		// Handle circular references with a replacer function
		const seen = new WeakSet();
		return JSON.stringify(value, (key, val) => {
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
