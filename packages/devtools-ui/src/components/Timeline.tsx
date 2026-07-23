import { useSignal } from "@preact/signals";
import type { TimelineBatch, TimelineUpdate } from "../context";
import { getContext } from "../context";
import { formatUpdateValue } from "./UpdateItem";

/** Maximum number of cascade batches rendered at once. The memory cap
 * (MAX_TIMELINE_BATCHES) is larger so filtering/focus retain history. */
export const MAX_VISIBLE_BATCHES = 100;

interface SignalIdentity {
	signalId: string;
	name: string;
	type: TimelineUpdate["signalType"];
	count: number;
}

const getOccurrenceKey = (update: TimelineUpdate) =>
	update.signalId ?? update.timelineId;

const formatTime = (timestamp: number) => {
	const date = new Date(timestamp);
	return `${date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})}.${String(date.getMilliseconds()).padStart(3, "0")}`;
};

const getBatchTimestamp = (batch: TimelineBatch) =>
	batch.updates[0]?.timestamp ?? batch.receivedAt;

function TimelineBatchCard({
	batch,
	query,
	focusedSignal,
	onFocusSignal,
}: {
	batch: TimelineBatch;
	query: string;
	focusedSignal: string;
	onFocusSignal: (signal: string) => void;
}) {
	const isCollapsed = useSignal(batch.updates.length > 12);
	const normalizedQuery = query.trim().toLowerCase();
	const updateMatches = (update: TimelineUpdate) => {
		const matchesFocus = !focusedSignal || update.signalId === focusedSignal;
		const matchesQuery =
			!normalizedQuery ||
			`${update.signalName} ${update.signalId ?? ""} ${update.signalType}`
				.toLowerCase()
				.includes(normalizedQuery);
		return matchesFocus && matchesQuery;
	};
	const rootUpdates = batch.updates.filter(update => (update.depth ?? 0) === 0);
	const signalCount = new Set(batch.updates.map(getOccurrenceKey)).size;
	const hasMatch = batch.updates.some(updateMatches);

	return (
		<article
			className={`timeline-batch ${hasMatch ? "has-match" : ""}`}
			data-cascade-id={batch.id}
		>
			<div className="timeline-rail" aria-hidden="true" />
			<div className="timeline-batch-card">
				<button
					className="timeline-batch-summary"
					onClick={() => (isCollapsed.value = !isCollapsed.value)}
					aria-expanded={!isCollapsed.value}
				>
					<span className="timeline-disclosure" aria-hidden="true">
						{isCollapsed.value ? "▶" : "▼"}
					</span>
					<span className="timeline-batch-title">
						Cascade {batch.id.replace("cascade-", "")}
					</span>
					<span className="timeline-batch-meta">
						{batch.updates.length} events · {signalCount} signals ·{" "}
						{rootUpdates.length} root
						{rootUpdates.length === 1 ? "" : "s"}
					</span>
					<time
						className="timeline-time"
						dateTime={new Date(getBatchTimestamp(batch)).toISOString()}
					>
						{formatTime(getBatchTimestamp(batch))}
					</time>
				</button>

				{!isCollapsed.value && (
					<div className="timeline-events" role="list">
						{batch.updates.map(update => {
							const isMatch = updateMatches(update);
							const depth = update.depth ?? 0;
							const isValueUpdate = update.type === "update";
							return (
								<div
									className={`timeline-event ${isMatch ? "is-match" : ""}`}
									data-signal-id={update.signalId}
									key={update.timelineId}
									role="listitem"
									style={{ "--timeline-depth": depth }}
								>
									<span
										className={`timeline-event-kind ${depth === 0 ? "root" : "derived"}`}
									>
										{depth === 0 ? "Root" : `Depth ${depth}`}
									</span>
									{update.signalId ? (
										<button
											className="timeline-signal"
											onClick={() =>
												update.signalId && onFocusSignal(update.signalId)
											}
											title={`Focus ${update.signalId}`}
										>
											{update.signalName}
										</button>
									) : (
										<span className="timeline-signal">{update.signalName}</span>
									)}
									<span className={`timeline-type ${update.signalType}`}>
										{update.signalType}
									</span>
									{isValueUpdate && (
										<span className="timeline-value-change">
											<span>{formatUpdateValue(update.prevValue)}</span>
											<span aria-hidden="true">→</span>
											<span>{formatUpdateValue(update.newValue)}</span>
										</span>
									)}
									<code className="timeline-signal-id">
										{update.signalId ?? "runtime ID unavailable"}
									</code>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</article>
	);
}

export function Timeline() {
	const { updatesStore } = getContext();
	const query = useSignal("");
	const focusedSignal = useSignal("");
	const batches = updatesStore.timelineBatches.value;
	const identities = new Map<string, SignalIdentity>();

	for (const batch of batches) {
		for (const update of batch.updates) {
			if (!update.signalId) continue;

			const existing = identities.get(update.signalId);
			if (existing) {
				existing.count++;
			} else {
				identities.set(update.signalId, {
					signalId: update.signalId,
					name: update.signalName,
					type: update.signalType,
					count: 1,
				});
			}
		}
	}

	const normalizedQuery = query.value.trim().toLowerCase();
	const matchesBatch = (batch: TimelineBatch) =>
		batch.updates.some(update => {
			const matchesFocus =
				!focusedSignal.value || update.signalId === focusedSignal.value;
			const matchesQuery =
				!normalizedQuery ||
				`${update.signalName} ${update.signalId ?? ""} ${update.signalType}`
					.toLowerCase()
					.includes(normalizedQuery);
			return matchesFocus && matchesQuery;
		});
	const matchingBatches = batches.filter(matchesBatch);
	const visibleBatches = matchingBatches.slice(-MAX_VISIBLE_BATCHES);

	return (
		<div className="timeline-container">
			<div className="timeline-toolbar">
				<label className="timeline-search-label">
					<span>Find cascades</span>
					<input
						aria-label="Find cascades by signal name or ID"
						className="timeline-search"
						placeholder="Signal name, ID, or type"
						value={query.value}
						onInput={event => (query.value = event.currentTarget.value)}
					/>
				</label>
				<label className="timeline-focus-label">
					<span>Focus signal</span>
					<select
						aria-label="Focus a signal"
						value={focusedSignal.value}
						onChange={event =>
							(focusedSignal.value = event.currentTarget.value)
						}
					>
						<option value="">All signals</option>
						{Array.from(identities.values()).map(identity => (
							<option key={identity.signalId} value={identity.signalId}>
								{identity.name} · {identity.signalId} ({identity.count})
							</option>
						))}
					</select>
				</label>
				{focusedSignal.value && (
					<button
						className="timeline-clear-focus"
						onClick={() => (focusedSignal.value = "")}
					>
						Clear focus
					</button>
				)}
				<span className="timeline-results" aria-live="polite">
					{matchingBatches.length} of {batches.length} cascades
					{matchingBatches.length > MAX_VISIBLE_BATCHES
						? ` · latest ${MAX_VISIBLE_BATCHES} shown`
						: ""}
				</span>
			</div>

			{visibleBatches.length === 0 ? (
				<div className="timeline-empty">
					{batches.length === 0
						? "Signal updates will appear here as chronological cascades."
						: "No cascades match the current filter."}
				</div>
			) : (
				<div className="timeline-list">
					{visibleBatches.map(batch => (
						<TimelineBatchCard
							batch={batch}
							focusedSignal={focusedSignal.value}
							key={batch.id}
							onFocusSignal={signal => (focusedSignal.value = signal)}
							query={query.value}
						/>
					))}
				</div>
			)}
		</div>
	);
}
