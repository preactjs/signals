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

const MAX_STRING_LENGTH = 1000;
const MAX_FORMAT_DEPTH = 5;
const MAX_FORMAT_KEYS = 30;
const MAX_FORMAT_ARRAY_LENGTH = 50;

// Cache for recently formatted values
const formatCache = new WeakMap<object, string>();

export function isReactOrPreactElement(obj: any): boolean {
	if (obj === null || typeof obj !== "object") return false;

	// Check for React/Preact element markers
	const typeofSymbol = obj.$$typeof;
	if (typeofSymbol) {
		// React 17+, React 19, Preact
		return (
			typeofSymbol === Symbol.for("react.element") ||
			typeofSymbol === Symbol.for("react.transitional.element")
		);
	}

	// Fallback: duck-type check for Preact elements without $$typeof
	return (
		"type" in obj &&
		"props" in obj &&
		"key" in obj &&
		(typeof obj.type === "string" || typeof obj.type === "function")
	);
}

export function formatReactElement(obj: any): string {
	const type = obj.type;
	let typeName: string;

	if (typeof type === "string") {
		// DOM element like 'div', 'span'
		typeName = type;
	} else if (typeof type === "function") {
		// Component - use displayName, name, or fallback
		typeName = type.displayName || type.name || "Component";
	} else {
		typeName = "Unknown";
	}

	const hasProps = obj.props && Object.keys(obj.props).length > 0;
	return hasProps ? `<${typeName} {...} />` : `<${typeName} />`;
}

export function formatValue(value: any, depth = 0): string {
	// Fast path for primitives - most common case
	if (value === null) return "null";
	if (value === undefined) return "undefined";

	const type = typeof value;
	if (type === "string") {
		// Truncate very long strings
		return value.length > MAX_STRING_LENGTH
			? value.slice(0, MAX_STRING_LENGTH) + "..."
			: value;
	}
	if (type === "number" || type === "boolean") return String(value);
	if (type === "function") return "[Function]";
	if (type === "symbol") return value.toString();
	if (type === "bigint") return value.toString() + "n";

	// Object handling with caching
	if (type === "object") {
		// Check cache first
		const cached = formatCache.get(value);
		if (cached !== undefined) {
			return cached;
		}

		const result = formatObjectValue(value);

		// Cache the result
		formatCache.set(value, result);
		return result;
	}

	return String(value);
}

function formatObjectValue(value: any): string {
	try {
		// Fast path for common types
		if (value instanceof Date) {
			return value.toISOString();
		}
		if (value instanceof RegExp) {
			return value.toString();
		}
		if (value instanceof Error) {
			return `${value.name}: ${value.message}`;
		}

		// Early bail for React/Preact elements - format them concisely
		if (isReactOrPreactElement(value)) {
			return formatReactElement(value);
		}

		// For arrays and objects, use optimized custom serialization
		// This avoids the overhead of JSON.stringify's replacer function
		const seen = new WeakSet();
		return fastStringify(value, seen, 0);
	} catch {
		return "(unstringifiable value)";
	}
}

function fastStringify(
	value: any,
	seen: WeakSet<object>,
	depth: number
): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";

	const type = typeof value;
	if (type === "bigint") return value.toString();
	if (type === "string") return JSON.stringify(value); // Use JSON for proper escaping
	if (type === "number" || type === "boolean") return String(value);
	if (type === "function") return '"[Function]"';

	if (type !== "object") return String(value);

	// Early bail for React/Preact elements - format them concisely
	if (isReactOrPreactElement(value)) {
		return JSON.stringify(formatReactElement(value));
	}

	if (depth > MAX_FORMAT_DEPTH) return '"[Max Depth]"';

	if (seen.has(value)) return '"[Circular]"';
	seen.add(value);

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const len = Math.min(value.length, MAX_FORMAT_ARRAY_LENGTH);
		const parts: string[] = new Array(len);
		for (let i = 0; i < len; i++) {
			parts[i] = fastStringify(value[i], seen, depth + 1);
		}
		if (value.length > MAX_FORMAT_ARRAY_LENGTH) {
			parts.push(`"...${value.length - MAX_FORMAT_ARRAY_LENGTH} more"`);
		}
		return "[" + parts.join(",") + "]";
	}

	// Handle plain objects
	const keys = Object.keys(value);
	if (keys.length === 0) return "{}";

	const keyCount = Math.min(keys.length, MAX_FORMAT_KEYS);
	const parts: string[] = new Array(keyCount);
	for (let i = 0; i < keyCount; i++) {
		const key = keys[i];
		parts[i] =
			JSON.stringify(key) + ":" + fastStringify(value[key], seen, depth + 1);
	}
	if (keys.length > MAX_FORMAT_KEYS) {
		parts.push(`"...":"${keys.length - MAX_FORMAT_KEYS} more keys"`);
	}
	return "{" + parts.join(",") + "}";
}

export function getSignalId(signal: Signal | Effect): string {
	if (!(signal as any)._debugId) {
		(signal as any)._debugId =
			`signal_${Math.random().toString(36).substring(2, 9)}`;
	}
	return (signal as any)._debugId;
}
