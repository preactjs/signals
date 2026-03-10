import { EventEmitter } from "node:events";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createClientModuleCode } from "../../src/client-module";
import { signalsVite } from "../../src/index";
import { createSignalsAgentStore } from "../../src/store";
import {
	queryEvents,
	sanitizeForTransport,
	type SignalsAgentEvent,
} from "../../src/shared";

const page = {
	pageId: "page-1",
	url: "http://localhost:5173/auth",
	pathname: "/auth",
};

function createMiddleware(
	options?: Parameters<typeof signalsVite>[0]
): (req: any, res: any, next: () => void) => void {
	const plugin = signalsVite(options);
	let middleware: ((req: any, res: any, next: () => void) => void) | undefined;
	(plugin.configureServer as any)?.({
		middlewares: {
			use(handler: (req: any, res: any, next: () => void) => void) {
				middleware = handler;
			},
		},
	} as any);
	if (!middleware) {
		throw new Error("signalsVite middleware did not register");
	}
	return middleware;
}

function createPlugin(
	options?: Parameters<typeof signalsVite>[0],
	command: "serve" | "build" = "serve"
) {
	const plugin = signalsVite(options);
	(plugin.configResolved as any)?.({
		command,
		esbuild: {},
		plugins: [],
	});
	return plugin;
}

function createClientSandbox(
	options: Parameters<typeof createClientModuleCode>[0],
	transportFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
) {
	const transformedCode = createClientModuleCode(options).replace(
		"export function installSignalsAgentClient() {",
		"function installSignalsAgentClient() {"
	);

	class FakeElement {}

	class FakeRequest {
		url: string;
		method: string;

		constructor(input: unknown, init?: { method?: string }) {
			this.url = new URL(String(input), "http://localhost:5173").toString();
			this.method = init?.method ?? "GET";
		}
	}

	class FakeXMLHttpRequest {
		status = 200;

		addEventListener() {}
	}

	const sandbox: Record<string, any> = {
		Blob: class FakeBlob {
			constructor(
				public readonly parts: unknown[],
				public readonly options?: { type?: string }
			) {}
		},
		Date,
		Element: FakeElement,
		JSON,
		Math,
		Request: FakeRequest,
		URL,
		WeakSet,
		XMLHttpRequest: FakeXMLHttpRequest,
		__PREACT_SIGNALS_DEVTOOLS__: {},
		addEventListener() {},
		clearTimeout,
		console: {
			error: vi.fn(),
			warn: vi.fn(),
		},
		crypto: {
			randomUUID: () => "page-1",
		},
		document: {
			addEventListener() {},
			title: "Signals Test",
			visibilityState: "visible",
		},
		fetch: transportFetch,
		history: {
			pushState() {},
			replaceState() {},
		},
		location: {
			hash: "",
			href: "http://localhost:5173/auth",
			origin: "http://localhost:5173",
			pathname: "/auth",
			search: "",
		},
		navigator: {
			sendBeacon: vi.fn(() => true),
			userAgent: "vitest",
		},
		setTimeout,
	};

	sandbox.window = sandbox;
	vMRun(transformedCode, sandbox);

	return {
		consoleMock: sandbox.console,
		installSignalsAgentClient: sandbox.installSignalsAgentClient as () => void,
		transportFetch,
	};
}

function vMRun(code: string, sandbox: Record<string, any>) {
	vm.runInNewContext(
		`${code}\nthis.installSignalsAgentClient = installSignalsAgentClient;`,
		sandbox
	);
}

function createRequest(options: {
	method?: string;
	url: string;
	body?: string;
}) {
	const req = new EventEmitter() as EventEmitter & {
		method?: string;
		url?: string;
		setEncoding: (encoding: string) => void;
	};
	req.method = options.method ?? "GET";
	req.url = options.url;
	req.setEncoding = () => {};
	queueMicrotask(() => {
		if (options.body != null) {
			req.emit("data", options.body);
		}
		req.emit("end");
	});
	return req;
}

function createResponse() {
	const headers = new Map<string, string>();
	const chunks: string[] = [];
	let resolveEnded!: () => void;
	const ended = new Promise<void>(resolve => {
		resolveEnded = resolve;
	});
	const res = new EventEmitter() as EventEmitter & {
		statusCode: number;
		setHeader: (name: string, value: string) => void;
		end: (chunk?: string) => void;
		writeHead: (statusCode: number, head: Record<string, string>) => void;
		write: (chunk: string) => boolean;
	};
	res.statusCode = 200;
	res.setHeader = (name, value) => {
		headers.set(name.toLowerCase(), String(value));
	};
	res.end = chunk => {
		if (chunk) {
			chunks.push(String(chunk));
		}
		resolveEnded();
	};
	res.writeHead = (statusCode, head) => {
		res.statusCode = statusCode;
		for (const [name, value] of Object.entries(head)) {
			headers.set(name.toLowerCase(), String(value));
		}
	};
	res.write = chunk => {
		chunks.push(String(chunk));
		return true;
	};
	return {
		ended,
		headers,
		res,
		text() {
			return chunks.join("");
		},
	};
}

describe("@preact/signals-vite-plugin", () => {
	it("redacts secret-looking keys before transport", () => {
		const value = sanitizeForTransport({
			email: "jovi@example.com",
			password: "super-secret",
			nested: {
				authorization: "Bearer token",
			},
		});

		expect(value).to.deep.equal({
			email: "jovi@example.com",
			password: "[Redacted]",
			nested: {
				authorization: "[Redacted]",
			},
		});
	});

	it("filters events by pattern and source", () => {
		const events: SignalsAgentEvent[] = [
			{
				source: "signals",
				type: "update",
				timestamp: 1,
				id: 1,
				page,
				signalName: "AuthForm.status",
				signalType: "signal",
				summary: "AuthForm.status update /auth",
			},
			{
				source: "network",
				type: "error",
				timestamp: 2,
				id: 2,
				page,
				method: "POST",
				requestUrl: "http://localhost:5173/api/login",
				status: 401,
				summary: "401 login error",
			},
		];

		expect(
			queryEvents(events, {
				filterPatterns: ["AuthForm"],
				sources: ["signals"],
			})
		).to.have.length(1);
		expect(
			queryEvents(events, {
				filterPatterns: ["401"],
				sources: ["network"],
			})
		).to.have.length(1);
	});

	it("streams only matching session events", () => {
		const store = createSignalsAgentStore({ maxEvents: 10 });
		const session = store.createSession({ filterPatterns: ["AuthForm"] });
		const listener = vi.fn();
		const unsubscribe = store.subscribe(session.id, listener)!;

		store.appendEvents([
			{
				source: "signals",
				type: "update",
				timestamp: 1,
				page,
				signalName: "AuthForm.status",
				signalType: "signal",
				summary: "AuthForm.status update /auth",
			},
			{
				source: "signals",
				type: "update",
				timestamp: 2,
				page,
				signalName: "ProfileForm.status",
				signalType: "signal",
				summary: "ProfileForm.status update /profile",
			},
		]);

		expect(listener).toHaveBeenCalledOnce();
		expect(listener.mock.calls[0][0]).to.have.length(1);
		expect(listener.mock.calls[0][0][0].signalName).to.equal("AuthForm.status");

		unsubscribe();
	});

	it("falls through when the path only shares an endpoint prefix", () => {
		const middleware = createMiddleware({ endpointBase: "/api" });
		const req = createRequest({ url: "/apifoo" });
		const { res } = createResponse();
		const next = vi.fn();

		middleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
		expect(res.statusCode).to.equal(200);
	});

	it("supports a root endpoint base without intercepting unrelated routes", async () => {
		const middleware = createMiddleware({ endpointBase: "/" });
		const next = vi.fn();

		const unrelatedRequest = createRequest({ url: "/auth" });
		const unrelatedResponse = createResponse();
		middleware(unrelatedRequest, unrelatedResponse.res, next);
		await Promise.resolve();

		expect(next).toHaveBeenCalledOnce();
		expect(unrelatedResponse.res.statusCode).to.equal(200);

		const appendEventsRequest = createRequest({
			method: "POST",
			url: "/events",
			body: JSON.stringify({
				events: [
					{
						source: "signals",
						type: "update",
						timestamp: 1,
						page,
						signalName: "AuthForm.status",
						signalType: "signal",
					},
				],
			}),
		});
		const appendEventsResponse = createResponse();
		middleware(appendEventsRequest, appendEventsResponse.res, vi.fn());
		await appendEventsResponse.ended;

		expect(JSON.parse(appendEventsResponse.text())).to.deep.equal({
			accepted: 1,
			lastEventId: 1,
		});

		const eventsRequest = createRequest({ url: "/events" });
		const eventsResponse = createResponse();
		middleware(eventsRequest, eventsResponse.res, vi.fn());
		await eventsResponse.ended;

		const payload = JSON.parse(eventsResponse.text());
		expect(payload.cursor).to.equal(1);
		expect(payload.events).to.have.length(1);
		expect(payload.events[0]).to.deep.include({
			id: 1,
			page,
			signalName: "AuthForm.status",
			signalType: "signal",
			source: "signals",
			summary: "AuthForm.status signal update /auth",
			timestamp: 1,
			type: "update",
		});
	});

	it("returns 400 for invalid JSON bodies", async () => {
		const middleware = createMiddleware();
		const req = createRequest({
			method: "POST",
			url: "/__signals_agent__/sessions",
			body: "{",
		});
		const response = createResponse();

		middleware(req, response.res, vi.fn());
		await response.ended;

		expect(response.res.statusCode).to.equal(400);
		expect(response.headers.get("content-type")).to.equal(
			"application/json; charset=utf-8"
		);
		expect(JSON.parse(response.text())).to.deep.equal({
			error: "Invalid JSON body",
		});
	});

	it("resets buffered events while preserving sessions", async () => {
		const middleware = createMiddleware();

		const createSessionRequest = createRequest({
			method: "POST",
			url: "/__signals_agent__/sessions",
			body: JSON.stringify({ filterPatterns: ["AuthForm"] }),
		});
		const createSessionResponse = createResponse();
		middleware(createSessionRequest, createSessionResponse.res, vi.fn());
		await createSessionResponse.ended;
		const { session } = JSON.parse(createSessionResponse.text());
		expect(session).to.deep.include({
			filterPatterns: ["AuthForm"],
			sources: ["signals", "network", "page"],
		});
		expect(session.id).to.be.a("string");
		expect(session.createdAt).to.be.a("number");
		expect(session.updatedAt).to.be.a("number");

		const appendEventsRequest = createRequest({
			method: "POST",
			url: "/__signals_agent__/events",
			body: JSON.stringify({
				events: [
					{
						source: "signals",
						type: "update",
						timestamp: 1,
						page,
						signalName: "AuthForm.status",
						signalType: "signal",
					},
				],
			}),
		});
		const appendEventsResponse = createResponse();
		middleware(appendEventsRequest, appendEventsResponse.res, vi.fn());
		await appendEventsResponse.ended;

		const resetRequest = createRequest({
			method: "POST",
			url: "/__signals_agent__/reset",
		});
		const resetResponse = createResponse();
		middleware(resetRequest, resetResponse.res, vi.fn());
		await resetResponse.ended;

		expect(JSON.parse(resetResponse.text())).to.deep.equal({ ok: true });

		const sessionsRequest = createRequest({
			url: "/__signals_agent__/sessions",
		});
		const sessionsResponse = createResponse();
		middleware(sessionsRequest, sessionsResponse.res, vi.fn());
		await sessionsResponse.ended;

		const { sessions } = JSON.parse(sessionsResponse.text());
		expect(sessions).to.have.length(1);
		expect(sessions[0]).to.deep.include({
			id: session.id,
			filterPatterns: session.filterPatterns,
			sources: session.sources,
		});
		expect(sessions[0].createdAt).to.be.a("number");
		expect(sessions[0].updatedAt).to.be.a("number");

		const eventsRequest = createRequest({
			url: `/__signals_agent__/sessions/${session.id}/events`,
		});
		const eventsResponse = createResponse();
		middleware(eventsRequest, eventsResponse.res, vi.fn());
		await eventsResponse.ended;

		const eventsPayload = JSON.parse(eventsResponse.text());
		expect(eventsPayload.events).to.deep.equal([]);
		expect(eventsPayload.cursor).to.equal(null);
		expect(eventsPayload.session).to.deep.include({
			id: session.id,
			filterPatterns: session.filterPatterns,
			sources: session.sources,
		});
		expect(eventsPayload.session.createdAt).to.be.a("number");
		expect(eventsPayload.session.updatedAt).to.be.a("number");
	});

	it("respects the configured maxEvents buffer limit", async () => {
		const middleware = createMiddleware({ maxEvents: 1 });
		const appendEventsRequest = createRequest({
			method: "POST",
			url: "/__signals_agent__/events",
			body: JSON.stringify({
				events: [
					{
						source: "signals",
						type: "update",
						timestamp: 1,
						page,
						signalName: "AuthForm.status",
						signalType: "signal",
					},
					{
						source: "signals",
						type: "update",
						timestamp: 2,
						page,
						signalName: "AuthForm.message",
						signalType: "signal",
					},
				],
			}),
		});
		const appendEventsResponse = createResponse();
		middleware(appendEventsRequest, appendEventsResponse.res, vi.fn());
		await appendEventsResponse.ended;

		const eventsRequest = createRequest({ url: "/__signals_agent__/events" });
		const eventsResponse = createResponse();
		middleware(eventsRequest, eventsResponse.res, vi.fn());
		await eventsResponse.ended;

		const payload = JSON.parse(eventsResponse.text());
		expect(payload.cursor).to.equal(2);
		expect(payload.events).to.have.length(1);
		expect(payload.events[0]).to.deep.include({
			id: 2,
			signalName: "AuthForm.message",
			timestamp: 2,
		});
	});

	it("uses root-scoped event URLs in the client when endpointBase is slash", async () => {
		vi.useFakeTimers();

		try {
			const { installSignalsAgentClient, transportFetch } = createClientSandbox(
				{
					endpointBase: "/",
				}
			);

			installSignalsAgentClient();
			await vi.advanceTimersByTimeAsync(150);

			expect(transportFetch).toHaveBeenCalledOnce();
			expect(transportFetch.mock.calls[0]?.[0]).to.equal(
				"http://localhost:5173/events"
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("retries client uploads when the agent endpoint responds with an error", async () => {
		vi.useFakeTimers();

		try {
			const transportFetch = vi
				.fn()
				.mockResolvedValueOnce({ ok: false, status: 500 })
				.mockResolvedValueOnce({ ok: true, status: 200 });
			const { consoleMock, installSignalsAgentClient } = createClientSandbox(
				{
					endpointBase: "/__signals_agent__",
				},
				transportFetch
			);

			installSignalsAgentClient();
			consoleMock.warn("retry me");

			await vi.advanceTimersByTimeAsync(150);
			expect(transportFetch).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(150);
			expect(transportFetch).toHaveBeenCalledTimes(2);

			const firstBatch = JSON.parse(transportFetch.mock.calls[0]?.[1]?.body);
			const secondBatch = JSON.parse(transportFetch.mock.calls[1]?.[1]?.body);

			expect(secondBatch).to.deep.equal(firstBatch);
			expect(
				firstBatch.events.map((event: SignalsAgentEvent) => event.source)
			).to.deep.equal(["signals", "page"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("applies the React transform with debug support during development", async () => {
		const plugin = createPlugin({ framework: "react" }, "serve");
		const result = await (plugin.transform as any)?.(
			[
				'import { signal } from "@preact/signals-react";',
				"const count = signal(0);",
				"export function Counter() {",
				"\treturn <p>{count.value}</p>;",
				"}",
			].join("\n"),
			"/src/Counter.tsx"
		);

		expect(result?.code).to.match(/useSignals\(1,\s*"Counter"\)/);
		expect(result?.code).to.match(
			/signal\(0,\s*\{\s*name:\s*"count \(Counter\.tsx:2\)"/
		);
	});

	it("applies the React transform without debug metadata during build", async () => {
		const plugin = createPlugin({ framework: "react" }, "build");
		const result = await (plugin.transform as any)?.(
			[
				'import { signal } from "@preact/signals-react";',
				"const count = signal(0);",
				"export function Counter() {",
				"\treturn <p>{count.value}</p>;",
				"}",
			].join("\n"),
			"/src/Counter.tsx"
		);

		expect(result?.code).to.match(/useSignals\(1\)/);
		expect(result?.code).not.to.contain('useSignals(1, "Counter")');
		expect(result?.code).not.to.contain("name:");
	});

	it("applies the Preact naming transform during development only", async () => {
		const source = [
			'import { signal } from "@preact/signals";',
			"const count = signal(0);",
			"export function Counter() {",
			"\treturn <p>{count.value}</p>;",
			"}",
		].join("\n");

		const devPlugin = createPlugin({ framework: "preact" }, "serve");
		const devResult = await (devPlugin.transform as any)?.(
			source,
			"/src/Counter.tsx"
		);
		const buildPlugin = createPlugin({ framework: "preact" }, "build");
		const buildResult = await (buildPlugin.transform as any)?.(
			source,
			"/src/Counter.tsx"
		);

		expect(devResult?.code).to.match(
			/signal\(0,\s*\{\s*name:\s*"count \(Counter\.tsx:2\)"/
		);
		expect(devResult?.code).not.to.contain("useSignals(");
		expect(buildResult).to.equal(null);
	});
});
