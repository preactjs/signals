import { Signal } from "@preact/signals-core";

export function getSignalName(signal: Signal): string {
	return signal.name || "(anonymous signal)";
}

export function formatValue(value: any): string {
	try {
		return typeof value === "object" ? JSON.stringify(value) : String(value);
	} catch {
		return "(unstringifiable value)";
	}
}
