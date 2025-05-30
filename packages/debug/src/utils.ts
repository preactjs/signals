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
		return typeof value === "object" ? JSON.stringify(value) : String(value);
	} catch {
		return "(unstringifiable value)";
	}
}
