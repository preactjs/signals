import type {
	SignalsAgentEvent,
	SignalsAgentQuery,
	SignalsAgentSession,
	SignalsAgentSessionInput,
} from "./shared";
import {
	eventMatchesQuery,
	normalizeSessionInput,
	queryEvents,
} from "./shared";

export interface SignalsAgentStoreOptions {
	maxEvents?: number;
}

export interface SignalsAgentSessionRecord extends SignalsAgentSession {
	listeners: Set<(events: SignalsAgentEvent[]) => void>;
}

export function createSignalsAgentStore(
	options: SignalsAgentStoreOptions = {}
) {
	const maxEvents = options.maxEvents ?? 2000;
	const events: SignalsAgentEvent[] = [];
	const sessions = new Map<string, SignalsAgentSessionRecord>();
	let nextEventId = 1;

	function createSession(
		input: SignalsAgentSessionInput = {}
	): SignalsAgentSession {
		const now = Date.now();
		const normalized = normalizeSessionInput(input);
		const session: SignalsAgentSessionRecord = {
			id: createSessionId(),
			createdAt: now,
			updatedAt: now,
			filterPatterns: normalized.filterPatterns,
			sources: normalized.sources,
			listeners: new Set(),
		};
		sessions.set(session.id, session);
		return toPublicSession(session);
	}

	function getSession(id: string): SignalsAgentSession | undefined {
		const session = sessions.get(id);
		return session ? toPublicSession(session) : undefined;
	}

	function listSessions(): SignalsAgentSession[] {
		return Array.from(sessions.values()).map(toPublicSession);
	}

	function deleteSession(id: string): boolean {
		const session = sessions.get(id);
		if (!session) return false;
		session.listeners.clear();
		return sessions.delete(id);
	}

	function reset() {
		events.length = 0;
		for (const session of sessions.values()) {
			session.listeners.clear();
		}
		sessions.clear();
		nextEventId = 1;
	}

	function appendEvents(
		incomingEvents: SignalsAgentEvent[]
	): SignalsAgentEvent[] {
		const appended = incomingEvents.map(event => ({
			...event,
			id: nextEventId++,
		}));

		events.push(...appended);
		if (events.length > maxEvents) {
			events.splice(0, events.length - maxEvents);
		}

		for (const session of sessions.values()) {
			const matched = appended.filter(event =>
				eventMatchesQuery(event, {
					filterPatterns: session.filterPatterns,
					sources: session.sources,
				})
			);
			if (matched.length === 0) continue;
			session.updatedAt = Date.now();
			session.listeners.forEach(listener => listener(matched));
		}

		return appended;
	}

	function getEvents(query: SignalsAgentQuery = {}): SignalsAgentEvent[] {
		return queryEvents(events, query);
	}

	function getEventsForSession(
		id: string,
		query: Omit<SignalsAgentQuery, "filterPatterns" | "sources"> = {}
	): SignalsAgentEvent[] | undefined {
		const session = sessions.get(id);
		if (!session) return undefined;
		return queryEvents(events, {
			...query,
			filterPatterns: session.filterPatterns,
			sources: session.sources,
		});
	}

	function subscribe(
		id: string,
		listener: (events: SignalsAgentEvent[]) => void
	): (() => void) | undefined {
		const session = sessions.get(id);
		if (!session) return undefined;
		session.listeners.add(listener);
		return () => {
			session.listeners.delete(listener);
		};
	}

	return {
		createSession,
		getSession,
		listSessions,
		deleteSession,
		reset,
		appendEvents,
		getEvents,
		getEventsForSession,
		subscribe,
	};
}

export type SignalsAgentStore = ReturnType<typeof createSignalsAgentStore>;

function createSessionId(): string {
	return `session_${Date.now().toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 10)}`;
}

function toPublicSession(
	session: SignalsAgentSessionRecord
): SignalsAgentSession {
	return {
		id: session.id,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		filterPatterns: [...session.filterPatterns],
		sources: [...session.sources],
	};
}
