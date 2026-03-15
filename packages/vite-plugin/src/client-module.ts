import { DEFAULT_REDACTION_PATTERNS } from "./shared";

export interface SignalsAgentClientModuleOptions {
	endpointBase: string;
}

export function createClientModuleCode(
	options: SignalsAgentClientModuleOptions
): string {
	return `
const options = ${JSON.stringify(options)};
const redactionPatterns = ${JSON.stringify(DEFAULT_REDACTION_PATTERNS)};
const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ARRAY_LENGTH = 100;

function shouldRedactKey(key) {
	if (!key) return false;
	return redactionPatterns.some(pattern => {
		try {
			return new RegExp(pattern, 'i').test(key);
		} catch {
			return String(key).toLowerCase().includes(String(pattern).toLowerCase());
		}
	});
}

function sanitize(value, key = '', depth = 0, visited = null) {
	if (shouldRedactKey(key)) return '[Redacted]';
	if (value == null) return value;
	const valueType = typeof value;
	if (valueType === 'function') return '[Function]';
	if (valueType === 'bigint') return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) {
		return { name: value.name, message: value.message, stack: value.stack };
	}
	if (valueType !== 'object') return value;
	if (depth >= MAX_DEPTH) return '[Max Depth Reached]';
	if (visited == null) visited = new WeakSet();
	if (visited.has(value)) return '[Circular]';
	visited.add(value);
	if (Array.isArray(value)) {
		const result = value.slice(0, MAX_ARRAY_LENGTH).map(item => sanitize(item, '', depth + 1, visited));
		if (value.length > MAX_ARRAY_LENGTH) {
			result.push('[...' + (value.length - MAX_ARRAY_LENGTH) + ' more items]');
		}
		return result;
	}
	const result = {};
	const keys = Object.keys(value).slice(0, MAX_KEYS);
	for (const currentKey of keys) {
		result[currentKey] = sanitize(value[currentKey], currentKey, depth + 1, visited);
	}
	if (Object.keys(value).length > MAX_KEYS) {
		result['...'] = '[' + (Object.keys(value).length - MAX_KEYS) + ' more keys]';
	}
	return result;
}

function createPageId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

function getEndpointPath(suffix = '') {
	if (!suffix) return options.endpointBase;
	const normalizedSuffix = suffix.startsWith('/') ? suffix : '/' + suffix;
	return options.endpointBase === '/' ? normalizedSuffix : options.endpointBase + normalizedSuffix;
}

function matchesAgentPath(pathname) {
	if (options.endpointBase === '/') {
		return pathname === '/events'
			|| pathname === '/health'
			|| pathname === '/reset'
			|| pathname === '/sessions'
			|| pathname.startsWith('/sessions/');
	}
	return pathname === options.endpointBase || pathname.startsWith(options.endpointBase + '/');
}

function describeTarget(target) {
	if (!(target instanceof Element)) return undefined;
	const parts = [target.tagName.toLowerCase()];
	if (target.id) parts.push('#' + target.id);
	if (typeof target.className === 'string' && target.className.trim()) {
		parts.push('.' + target.className.trim().split(/\s+/).slice(0, 3).join('.'));
	}
	const name = target.getAttribute('name');
	if (name) parts.push('[name="' + name + '"]');
	const type = target.getAttribute('type');
	if (type) parts.push('[type="' + type + '"]');
	const role = target.getAttribute('role');
	if (role) parts.push('[role="' + role + '"]');
	return parts.join('');
}

function stringifyArg(arg) {
	if (typeof arg === 'string') return arg;
	try {
		return JSON.stringify(sanitize(arg));
	} catch {
		return String(arg);
	}
}

export function installSignalsAgentClient() {
	if (typeof window === 'undefined') return;
	if (window.__PREACT_SIGNALS_AGENT_INSTALLED__) return;
	window.__PREACT_SIGNALS_AGENT_INSTALLED__ = true;

	const pageId = createPageId();
	const endpoint = new URL(getEndpointPath('/events'), window.location.origin).toString();
	const pending = [];
	let flushTimer = null;
	let flushing = false;

	function getPageContext() {
		return {
			pageId,
			url: window.location.href,
			pathname: window.location.pathname + window.location.search + window.location.hash,
			title: document.title,
			userAgent: navigator.userAgent,
		};
	}

	function isAgentRequestUrl(input) {
		try {
			const url = new URL(String(input), window.location.href);
			if (url.origin !== window.location.origin) return false;
			return matchesAgentPath(url.pathname);
		} catch {
			return false;
		}
	}

	function scheduleFlush() {
		if (flushTimer != null) return;
		flushTimer = window.setTimeout(() => {
			flushTimer = null;
			flush();
		}, 150);
	}

	async function flush() {
		if (flushing || pending.length === 0) return;
		flushing = true;
		const batch = pending.splice(0, Math.min(pending.length, 50));
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ events: batch }),
				keepalive: true,
			});
			if (!response.ok) {
				throw new Error('Signals agent upload failed with status ' + response.status);
			}
		} catch {
			pending.unshift(...batch);
		} finally {
			flushing = false;
			if (pending.length > 0) {
				scheduleFlush();
			}
		}
	}

	function flushWithBeacon() {
		if (!('sendBeacon' in navigator) || pending.length === 0) {
			return;
		}
		const batch = pending.splice(0, pending.length);
		let accepted = false;
		try {
			const payload = JSON.stringify({ events: batch });
			accepted = navigator.sendBeacon(
				endpoint,
				typeof Blob === 'function'
					? new Blob([payload], { type: 'application/json' })
					: payload
			);
		} catch {
			accepted = false;
		}
		if (!accepted) {
			pending.unshift(...batch);
			void flush();
		}
	}

	function enqueue(input) {
		const events = Array.isArray(input) ? input : [input];
		for (const event of events) {
			pending.push({
				...event,
				timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
				page: getPageContext(),
			});
		}
		if (pending.length >= 20) {
			void flush();
		} else {
			scheduleFlush();
		}
	}

	function toAbsoluteUrl(input) {
		try {
			return new URL(String(input), window.location.href).toString();
		} catch {
			return String(input);
		}
	}

	function installSignalsCapture() {
		const connect = (attempt = 0) => {
			const api = window.__PREACT_SIGNALS_DEVTOOLS__;
			if (!api) {
				if (attempt < 100) {
					window.setTimeout(() => connect(attempt + 1), 100);
				}
				return;
			}

			enqueue({ source: 'signals', type: 'init' });

			if (typeof api.onUpdate === 'function') {
				api.onUpdate(updates => {
					enqueue(updates.map(update => ({
						source: 'signals',
						type: update.type,
						signalType: update.signalType,
						signalName: update.signalName,
						prevValue: sanitize(update.prevValue),
						newValue: sanitize(update.newValue),
						subscribedTo: update.subscribedTo,
						allDependencies: sanitize(update.allDependencies),
						timestamp: update.timestamp,
					})));
				});
			}

			if (typeof api.onDisposal === 'function') {
				api.onDisposal(disposals => {
					enqueue(disposals.map(disposal => ({
						source: 'signals',
						type: 'disposed',
						signalType: disposal.signalType,
						signalName: disposal.signalName,
						timestamp: disposal.timestamp,
					})));
				});
			}
		};

		connect();
	}

	function installPageCapture() {
		enqueue({ source: 'page', type: 'ready', message: 'signals agent ready' });

		const emitNavigation = message => {
			enqueue({ source: 'page', type: 'navigate', message });
		};

		const originalPushState = history.pushState.bind(history);
		history.pushState = function (...args) {
			const result = originalPushState(...args);
			emitNavigation('pushState');
			return result;
		};

		const originalReplaceState = history.replaceState.bind(history);
		history.replaceState = function (...args) {
			const result = originalReplaceState(...args);
			emitNavigation('replaceState');
			return result;
		};

		window.addEventListener('popstate', () => emitNavigation('popstate'));
		window.addEventListener('hashchange', () => emitNavigation('hashchange'));
		window.addEventListener('error', event => {
			enqueue({
				source: 'page',
				type: 'error',
				message: event.message,
				reason: sanitize(event.error),
			});
		});
		window.addEventListener('unhandledrejection', event => {
			enqueue({
				source: 'page',
				type: 'unhandledrejection',
				message: 'Unhandled promise rejection',
				reason: sanitize(event.reason),
			});
		});
		document.addEventListener('click', event => {
			enqueue({
				source: 'page',
				type: 'interaction',
				interactionType: 'click',
				target: describeTarget(event.target),
			});
		}, true);
		document.addEventListener('submit', event => {
			enqueue({
				source: 'page',
				type: 'interaction',
				interactionType: 'submit',
				target: describeTarget(event.target),
			});
		}, true);
	}

	function installNetworkCapture() {
		const originalFetch = window.fetch.bind(window);
		window.fetch = async (...args) => {
			const startedAt = Date.now();
			let method = 'GET';
			let requestUrl = window.location.href;
			try {
				const request = args[0] instanceof Request ? args[0] : new Request(args[0], args[1]);
				method = request.method || method;
				requestUrl = request.url || requestUrl;
			} catch {
				method = args[1] && args[1].method ? String(args[1].method) : method;
				requestUrl = toAbsoluteUrl(args[0]);
			}

			if (isAgentRequestUrl(requestUrl)) {
				return originalFetch(...args);
			}

			enqueue({
				source: 'network',
				type: 'request',
				method,
				requestUrl,
				timestamp: startedAt,
			});

			try {
				const response = await originalFetch(...args);
				enqueue({
					source: 'network',
					type: response.ok ? 'response' : 'error',
					method,
					requestUrl,
					status: response.status,
					ok: response.ok,
					duration: Date.now() - startedAt,
				});
				return response;
			} catch (error) {
				enqueue({
					source: 'network',
					type: 'error',
					method,
					requestUrl,
					duration: Date.now() - startedAt,
					error: sanitize(error),
				});
				throw error;
			}
		};

		const originalOpen = XMLHttpRequest.prototype.open;
		const originalSend = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			this.__signalsAgentMeta = {
				method: String(method || 'GET'),
				requestUrl: toAbsoluteUrl(url),
			};
			return originalOpen.call(this, method, url, ...rest);
		};
		XMLHttpRequest.prototype.send = function (...args) {
			const meta = this.__signalsAgentMeta || {
				method: 'GET',
				requestUrl: window.location.href,
			};
			if (isAgentRequestUrl(meta.requestUrl)) {
				return originalSend.apply(this, args);
			}
			const startedAt = Date.now();
			enqueue({
				source: 'network',
				type: 'request',
				method: meta.method,
				requestUrl: meta.requestUrl,
				timestamp: startedAt,
			});
			this.addEventListener('loadend', () => {
				enqueue({
					source: 'network',
					type: this.status >= 200 && this.status < 400 ? 'response' : 'error',
					method: meta.method,
					requestUrl: meta.requestUrl,
					status: this.status,
					ok: this.status >= 200 && this.status < 400,
					duration: Date.now() - startedAt,
				});
			}, { once: true });
			return originalSend.apply(this, args);
		};
	}

	installSignalsCapture();
	installPageCapture();
	installNetworkCapture();
	window.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			flushWithBeacon();
		}
	});
	window.addEventListener('beforeunload', flushWithBeacon);
}
`;
}
