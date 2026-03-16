import type { IncomingMessage, ServerResponse } from "node:http";
import type { SignalsAgentStore } from "./store";
import {
	DEFAULT_REDACTION_PATTERNS,
	DEFAULT_SOURCES,
	sanitizeForTransport,
	summarizeEvent,
	type SignalsAgentEvent,
	type SignalsAgentNetworkEvent,
	type SignalsAgentPageContext,
	type SignalsAgentQuery,
	type SignalsAgentSource,
} from "./shared";

export interface HandleRequestOptions {
	store: SignalsAgentStore;
	endpointBase: string;
	req: IncomingMessage;
	res: ServerResponse;
	next: () => void;
}

export function createSignalsAgentMiddleware({
	store,
	endpointBase,
}: Pick<HandleRequestOptions, "store" | "endpointBase">) {
	return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
		handleRequest({
			store,
			endpointBase,
			req,
			res,
			next,
		}).catch(error => {
			const statusCode = error instanceof InvalidJsonBodyError ? 400 : 500;
			sendJson(res, statusCode, {
				error: error instanceof Error ? error.message : "Unexpected error",
			});
		});
	};
}

export async function handleRequest({
	store,
	endpointBase,
	req,
	res,
	next,
}: HandleRequestOptions) {
	if (!req.url) return next();

	const url = new URL(req.url, "http://signals-agent.local");
	if (!matchesEndpointPath(url.pathname, endpointBase)) {
		return next();
	}

	if (
		req.method === "GET" &&
		url.pathname === resolveEndpointPath(endpointBase, "/health")
	) {
		return sendJson(res, 200, { ok: true });
	}

	if (
		req.method === "POST" &&
		url.pathname === resolveEndpointPath(endpointBase, "/events")
	) {
		const body = await readJsonBody(req);
		const events = normalizeIncomingEvents(body);
		const appended = store.appendEvents(events);
		return sendJson(res, 200, {
			accepted: appended.length,
			lastEventId: appended.at(-1)?.id ?? null,
		});
	}

	if (
		req.method === "GET" &&
		url.pathname === resolveEndpointPath(endpointBase, "/events")
	) {
		const events = store.getEvents(parseQuery(url.searchParams));
		return sendJson(res, 200, {
			events,
			cursor: events.at(-1)?.id ?? null,
		});
	}

	if (
		req.method === "GET" &&
		url.pathname === resolveEndpointPath(endpointBase, "/sessions")
	) {
		return sendJson(res, 200, { sessions: store.listSessions() });
	}

	if (
		req.method === "POST" &&
		url.pathname === resolveEndpointPath(endpointBase, "/sessions")
	) {
		const body = await readJsonBody(req);
		const session = store.createSession({
			filterPatterns: toStringArray(body?.filterPatterns),
			sources: toSources(body?.sources),
		});
		return sendJson(res, 201, { session });
	}

	if (
		req.method === "POST" &&
		url.pathname === resolveEndpointPath(endpointBase, "/reset")
	) {
		store.reset();
		return sendJson(res, 200, { ok: true });
	}

	const sessionsPath = resolveEndpointPath(endpointBase, "/sessions");

	const sessionMatch = url.pathname.match(
		new RegExp(`^${escapeRegExp(sessionsPath)}/([^/]+)(?:/(events|stream))?$`)
	);
	if (!sessionMatch) {
		return sendJson(res, 404, { error: "Not found" });
	}

	const [, sessionId, suffix] = sessionMatch;
	const session = store.getSession(sessionId);
	if (!session) {
		return sendJson(res, 404, { error: "Unknown session" });
	}

	if (req.method === "GET" && !suffix) {
		return sendJson(res, 200, { session });
	}

	if (req.method === "DELETE" && !suffix) {
		store.deleteSession(sessionId);
		return sendJson(res, 200, { ok: true });
	}

	if (req.method === "GET" && suffix === "events") {
		const events = store.getEventsForSession(
			sessionId,
			parseQuery(url.searchParams)
		);
		return sendJson(res, 200, {
			session,
			events,
			cursor: events?.at(-1)?.id ?? null,
		});
	}

	if (req.method === "GET" && suffix === "stream") {
		return streamSessionEvents({
			req,
			res,
			store,
			sessionId,
			searchParams: url.searchParams,
		});
	}

	return sendJson(res, 405, { error: "Method not allowed" });
}

export class InvalidJsonBodyError extends Error {
	constructor() {
		super("Invalid JSON body");
		this.name = "InvalidJsonBodyError";
	}
}

export function sendJson(res: ServerResponse, statusCode: number, body: any) {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(body));
}

function streamSessionEvents({
	req,
	res,
	store,
	sessionId,
	searchParams,
}: {
	req: IncomingMessage;
	res: ServerResponse;
	store: SignalsAgentStore;
	sessionId: string;
	searchParams: URLSearchParams;
}) {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
	});
	res.write(": connected\n\n");

	const query = parseQuery(searchParams);
	const initialEvents = store.getEventsForSession(sessionId, query) ?? [];
	writeSseEvent(res, "ready", {
		events: initialEvents,
		cursor: initialEvents.at(-1)?.id ?? null,
	});

	const unsubscribe = store.subscribe(sessionId, events => {
		writeSseEvent(res, "events", {
			events,
			cursor: events.at(-1)?.id ?? null,
		});
	});

	const keepAlive = setInterval(() => {
		res.write(": keepalive\n\n");
	}, 15000);

	req.on("close", () => {
		clearInterval(keepAlive);
		unsubscribe?.();
		res.end();
	});
}

function writeSseEvent(res: ServerResponse, event: string, data: any) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeIncomingEvents(body: any): SignalsAgentEvent[] {
	const rawEvents = Array.isArray(body?.events)
		? body.events
		: Array.isArray(body)
			? body
			: body
				? [body]
				: [];

	return rawEvents
		.map((rawEvent: any) => normalizeIncomingEvent(rawEvent))
		.filter(
			(event: SignalsAgentEvent | null): event is SignalsAgentEvent =>
				event != null
		);
}

function normalizeIncomingEvent(rawEvent: any): SignalsAgentEvent | null {
	const source = toSource(rawEvent?.source);
	if (!source) return null;

	const page = normalizePageContext(rawEvent?.page);
	const timestamp =
		typeof rawEvent?.timestamp === "number" ? rawEvent.timestamp : Date.now();
	const type = toStringValue(rawEvent?.type) ?? "unknown";

	if (source === "signals") {
		const event = {
			source,
			type,
			timestamp,
			page,
			signalType: toStringValue(rawEvent?.signalType) as
				| "signal"
				| "computed"
				| "effect"
				| "component"
				| undefined,
			signalName: toStringValue(rawEvent?.signalName),
			prevValue: sanitizeForTransport(
				rawEvent?.prevValue,
				DEFAULT_REDACTION_PATTERNS
			),
			newValue: sanitizeForTransport(
				rawEvent?.newValue,
				DEFAULT_REDACTION_PATTERNS
			),
			subscribedTo: toStringValue(rawEvent?.subscribedTo),
			allDependencies: sanitizeForTransport(
				rawEvent?.allDependencies,
				DEFAULT_REDACTION_PATTERNS
			),
		} as SignalsAgentEvent;
		event.summary = summarizeEvent(event);
		return event;
	}

	if (source === "network") {
		const event = {
			source,
			type:
				type === "request" || type === "response" || type === "error"
					? type
					: "response",
			timestamp,
			page,
			method: toStringValue(rawEvent?.method),
			requestUrl: toStringValue(rawEvent?.requestUrl) ?? page.url,
			status: toNumberValue(rawEvent?.status),
			ok: toBooleanValue(rawEvent?.ok),
			duration: toNumberValue(rawEvent?.duration),
			error: sanitizeForTransport(rawEvent?.error, DEFAULT_REDACTION_PATTERNS),
		} as SignalsAgentNetworkEvent & { summary?: string };
		event.summary = summarizeEvent(event);
		return event;
	}

	const event = {
		source,
		type,
		timestamp,
		page,
		target: toStringValue(rawEvent?.target),
		message: toStringValue(rawEvent?.message),
		reason: sanitizeForTransport(rawEvent?.reason, DEFAULT_REDACTION_PATTERNS),
		interactionType: toStringValue(rawEvent?.interactionType),
	} as SignalsAgentEvent;
	event.summary = summarizeEvent(event);
	return event;
}

function normalizePageContext(input: any): SignalsAgentPageContext {
	const url = toStringValue(input?.url) ?? "";
	let pathname = toStringValue(input?.pathname);

	if (!pathname && url) {
		try {
			const parsedUrl = new URL(url);
			pathname = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
		} catch {
			pathname = url;
		}
	}

	return {
		pageId: toStringValue(input?.pageId) ?? "unknown-page",
		url,
		pathname,
		title: toStringValue(input?.title),
		userAgent: toStringValue(input?.userAgent),
	};
}

function parseQuery(searchParams: URLSearchParams): SignalsAgentQuery {
	const filterPatterns = toStringArray(searchParams.getAll("filterPatterns"));
	return {
		after: toNumberValue(searchParams.get("after")),
		limit: toNumberValue(searchParams.get("limit")),
		filterPatterns:
			filterPatterns.length > 0
				? filterPatterns
				: toStringArray(searchParams.getAll("filter")),
		sources: toSources(searchParams.getAll("source")),
	};
}

function toSources(input: unknown): SignalsAgentSource[] | undefined {
	const values = toStringArray(input)
		.map(value => toSource(value))
		.filter((value): value is SignalsAgentSource => value != null);
	return values.length > 0 ? values : undefined;
}

function toSource(value: unknown): SignalsAgentSource | null {
	if (typeof value !== "string") return null;
	if ((DEFAULT_SOURCES as string[]).includes(value)) {
		return value as SignalsAgentSource;
	}
	return null;
}

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(item => toStringArray(item));
	}
	if (typeof value !== "string") return [];
	return value
		.split(",")
		.map(item => item.trim())
		.filter(Boolean);
}

function toStringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function toNumberValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || value.length === 0) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function toBooleanValue(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

function matchesEndpointPath(pathname: string, endpointBase: string): boolean {
	if (endpointBase === "/") {
		return (
			pathname === "/events" ||
			pathname === "/health" ||
			pathname === "/reset" ||
			pathname === "/sessions" ||
			pathname.startsWith("/sessions/")
		);
	}

	return pathname === endpointBase || pathname.startsWith(`${endpointBase}/`);
}

function resolveEndpointPath(endpointBase: string, suffix = ""): string {
	if (suffix.length === 0) {
		return endpointBase;
	}

	const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
	return endpointBase === "/"
		? normalizedSuffix
		: `${endpointBase}${normalizedSuffix}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
	const body = await new Promise<string>((resolve, reject) => {
		let raw = "";
		req.setEncoding("utf8");
		req.on("data", chunk => {
			raw += chunk;
		});
		req.on("end", () => resolve(raw));
		req.on("error", reject);
	});

	if (body.length === 0) return {};
	try {
		return JSON.parse(body);
	} catch {
		throw new InvalidJsonBodyError();
	}
}
