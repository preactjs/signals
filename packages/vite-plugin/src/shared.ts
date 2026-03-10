export type SignalsAgentSource = "signals" | "network" | "page";

export interface SignalsAgentPageContext {
	pageId: string;
	url: string;
	pathname?: string;
	title?: string;
	userAgent?: string;
}

export interface SignalsAgentEventBase {
	id?: number;
	source: SignalsAgentSource;
	type: string;
	timestamp: number;
	page: SignalsAgentPageContext;
	summary?: string;
}

export interface SignalsAgentDependency {
	id: string;
	name: string;
	type: "signal" | "computed";
}

export interface SignalsAgentSignalEvent extends SignalsAgentEventBase {
	source: "signals";
	type: "init" | "update" | "effect" | "component" | "disposed";
	signalType?: "signal" | "computed" | "effect" | "component";
	signalName?: string;
	prevValue?: any;
	newValue?: any;
	subscribedTo?: string;
	allDependencies?: SignalsAgentDependency[];
}

export interface SignalsAgentNetworkEvent extends SignalsAgentEventBase {
	source: "network";
	type: "request" | "response" | "error";
	method?: string;
	requestUrl: string;
	status?: number;
	ok?: boolean;
	duration?: number;
	error?: any;
}

export interface SignalsAgentPageEvent extends SignalsAgentEventBase {
	source: "page";
	type: "ready" | "navigate" | "interaction" | "error" | "unhandledrejection";
	target?: string;
	message?: string;
	reason?: any;
	interactionType?: string;
}

export type SignalsAgentEvent =
	| SignalsAgentSignalEvent
	| SignalsAgentNetworkEvent
	| SignalsAgentPageEvent;

export interface SignalsAgentSessionInput {
	filterPatterns?: string[];
	sources?: SignalsAgentSource[];
}

export interface SignalsAgentSession extends Required<SignalsAgentSessionInput> {
	id: string;
	createdAt: number;
	updatedAt: number;
}

export interface SignalsAgentQuery {
	after?: number;
	limit?: number;
	filterPatterns?: string[];
	sources?: SignalsAgentSource[];
}

export const DEFAULT_SOURCES: SignalsAgentSource[] = [
	"signals",
	"network",
	"page",
];

export const DEFAULT_REDACTION_PATTERNS = [
	"password",
	"passwd",
	"secret",
	"token",
	"authorization",
	"cookie",
	"session",
	"credential",
	"api[_-]?key",
];

const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ARRAY_LENGTH = 100;

export function normalizeSessionInput(
	input: SignalsAgentSessionInput = {}
): Required<SignalsAgentSessionInput> {
	return {
		filterPatterns: input.filterPatterns?.filter(Boolean) ?? [],
		sources:
			(input.sources?.length ?? 0) > 0
				? Array.from(new Set(input.sources))
				: [...DEFAULT_SOURCES],
	};
}

export function sanitizeForTransport(
	value: any,
	redactionPatterns: string[] = DEFAULT_REDACTION_PATTERNS,
	key = "",
	depth = 0,
	visited: WeakSet<object> | null = null
): any {
	if (shouldRedactKey(key, redactionPatterns)) {
		return "[Redacted]";
	}

	if (value == null) return value;

	const valueType = typeof value;
	if (valueType === "function") return "[Function]";
	if (valueType === "bigint") return value.toString();
	if (valueType !== "object") return value;
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (depth >= MAX_DEPTH) return "[Max Depth Reached]";

	if (visited == null) {
		visited = new WeakSet();
	}

	if (visited.has(value)) return "[Circular]";
	visited.add(value);

	if (Array.isArray(value)) {
		const result = value
			.slice(0, MAX_ARRAY_LENGTH)
			.map(item =>
				sanitizeForTransport(item, redactionPatterns, "", depth + 1, visited)
			);
		if (value.length > MAX_ARRAY_LENGTH) {
			result.push(`[...${value.length - MAX_ARRAY_LENGTH} more items]`);
		}
		return result;
	}

	const result: Record<string, any> = {};
	const keys = Object.keys(value);
	const keyCount = Math.min(keys.length, MAX_KEYS);

	for (let i = 0; i < keyCount; i++) {
		const currentKey = keys[i];
		result[currentKey] = sanitizeForTransport(
			value[currentKey],
			redactionPatterns,
			currentKey,
			depth + 1,
			visited
		);
	}

	if (keys.length > MAX_KEYS) {
		result["..."] = `[${keys.length - MAX_KEYS} more keys]`;
	}

	return result;
}

export function summarizeEvent(event: SignalsAgentEvent): string {
	switch (event.source) {
		case "signals":
			return [
				event.signalName,
				event.signalType,
				event.type,
				event.page.pathname,
			]
				.filter(Boolean)
				.join(" ");
		case "network":
			return [
				event.type,
				event.method,
				event.requestUrl,
				event.status,
				event.page.pathname,
			]
				.filter(Boolean)
				.join(" ");
		case "page":
			return [event.type, event.target, event.message, event.page.pathname]
				.filter(Boolean)
				.join(" ");
	}
	return "";
}

export function eventMatchesQuery(
	event: SignalsAgentEvent,
	query: SignalsAgentSessionInput
): boolean {
	const normalized = normalizeSessionInput(query);
	if (!normalized.sources.includes(event.source)) {
		return false;
	}

	if (normalized.filterPatterns.length === 0) {
		return true;
	}

	const candidates = getEventCandidates(event);
	return normalized.filterPatterns.some(pattern =>
		candidates.some(candidate => matchesPattern(candidate, pattern))
	);
}

export function queryEvents(
	events: SignalsAgentEvent[],
	query: SignalsAgentQuery = {}
): SignalsAgentEvent[] {
	const after = query.after ?? 0;
	const filtered = events.filter(event => {
		if ((event.id ?? 0) <= after) return false;
		return eventMatchesQuery(event, query);
	});

	if (query.limit == null || query.limit <= 0) {
		return filtered;
	}

	return filtered.slice(-query.limit);
}

function shouldRedactKey(key: string, patterns: string[]): boolean {
	if (!key) return false;
	return patterns.some(pattern => matchesPattern(key, pattern));
}

function getEventCandidates(event: SignalsAgentEvent): string[] {
	const candidates = [
		event.summary,
		event.source,
		event.type,
		event.page.url,
		event.page.pathname,
		event.page.title,
	];

	if (event.source === "signals") {
		candidates.push(event.signalName, event.signalType);
		for (const dependency of event.allDependencies ?? []) {
			candidates.push(dependency.name, dependency.id, dependency.type);
		}
	} else if (event.source === "network") {
		candidates.push(event.method, event.requestUrl, String(event.status ?? ""));
	} else if (event.source === "page") {
		candidates.push(event.target, event.message, event.interactionType);
	}

	return candidates.filter((candidate): candidate is string => !!candidate);
}

function matchesPattern(value: string, pattern: string): boolean {
	try {
		return new RegExp(pattern, "i").test(value);
	} catch {
		return value.toLowerCase().includes(pattern.toLowerCase());
	}
}
