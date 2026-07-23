import { Fragment, type ComponentChildren } from "preact";
import { useSignal } from "@preact/signals";
import { copyToClipboard } from "../clipboard";
import { getContext } from "../context";
import type {
	NoOutputChangeOccurrence,
	PerformanceInstanceSummary,
} from "../models/PerformanceInsightsModel";
import { MIN_BASELINE_POPULATION } from "../models/PerformanceInsightsModel";
import { PERFORMANCE_OBSERVATION_LIMIT } from "../models/UpdatesModel";

const MAX_INSIGHT_ROWS = 100;

function InstanceCell({ summary }: { summary: PerformanceInstanceSummary }) {
	return (
		<div className="performance-instance">
			<strong>{summary.signalName || "(anonymous)"}</strong>
			<span className="performance-instance-id" title={summary.signalId}>
				{summary.signalId}
			</span>
		</div>
	);
}

function VisibleRows({
	items,
	colSpan,
	children,
}: {
	items: PerformanceInstanceSummary[];
	colSpan: number;
	children: (summary: PerformanceInstanceSummary) => ComponentChildren;
}) {
	return (
		<>
			{items.slice(0, MAX_INSIGHT_ROWS).map(children)}
			{items.length > MAX_INSIGHT_ROWS && (
				<tr className="performance-truncation">
					<td colSpan={colSpan}>
						Showing the top {MAX_INSIGHT_ROWS} of {items.length} instances.
					</td>
				</tr>
			)}
		</>
	);
}

function HotspotTierBadge({
	tier,
}: {
	tier: PerformanceInstanceSummary["hotspotTier"];
}) {
	if (tier === "severe") {
		return <span className="performance-tier severe">≥4× baseline</span>;
	}
	return <span className="performance-tier elevated">≥2× baseline</span>;
}

function formatTimestamp(value: number | undefined): string {
	if (value === undefined) return "—";
	return new Date(value).toLocaleTimeString();
}

function DependencyList({
	dependencies,
}: {
	dependencies: NoOutputChangeOccurrence["allDependencies"];
}) {
	if (!dependencies || dependencies.length === 0) {
		return <span className="performance-muted">No dependency metadata</span>;
	}
	return (
		<ul className="performance-dependency-list">
			{dependencies.map(dep => (
				<li key={dep.id} className="performance-dependency-item">
					<span className={`performance-dependency-type ${dep.type}`}>
						{dep.type}
					</span>
					<span className="performance-dependency-name">
						{dep.name || "(anonymous)"}
					</span>
					<span className="performance-dependency-id" title={dep.id}>
						{dep.id}
					</span>
				</li>
			))}
		</ul>
	);
}

function TriggerSource({
	occurrence,
}: {
	occurrence: NoOutputChangeOccurrence;
}) {
	if (!occurrence.subscribedTo) {
		return <span className="performance-muted">Unknown source</span>;
	}

	const dependency = occurrence.allDependencies?.find(
		candidate => candidate.id === occurrence.subscribedTo
	);
	if (!dependency) {
		return (
			<code className="performance-trigger-id">{occurrence.subscribedTo}</code>
		);
	}

	return (
		<span className="performance-trigger-source">
			<span className={`performance-dependency-type ${dependency.type}`}>
				{dependency.type}
			</span>
			<strong>{dependency.name || "(anonymous)"}</strong>
			<code className="performance-trigger-id">{dependency.id}</code>
		</span>
	);
}

function OccurrenceRow({
	occurrence,
}: {
	occurrence: NoOutputChangeOccurrence;
}) {
	return (
		<li className="performance-occurrence">
			<div className="performance-occurrence-row">
				<span className="performance-occurrence-label">Triggered by</span>
				<span className="performance-occurrence-value">
					<TriggerSource occurrence={occurrence} />
				</span>
			</div>
			<div className="performance-occurrence-row">
				<span className="performance-occurrence-label">Runtime timestamp</span>
				<span className="performance-occurrence-value">
					{formatTimestamp(occurrence.timestamp)}
				</span>
			</div>
			<div className="performance-occurrence-row">
				<span className="performance-occurrence-label">Received at</span>
				<span className="performance-occurrence-value">
					{formatTimestamp(occurrence.receivedAt)}
				</span>
			</div>
			<div className="performance-occurrence-deps">
				<span className="performance-occurrence-label">
					Current dependencies
				</span>
				<DependencyList dependencies={occurrence.allDependencies} />
			</div>
		</li>
	);
}

export function PerformanceInsights() {
	const { performanceStore } = getContext();
	const insights = performanceStore.insights.value;
	const expanded = useSignal<Set<string>>(new Set());
	const exportStatus = useSignal<string>();

	const toggleRow = (signalId: string) => {
		const next = new Set(expanded.value);
		if (next.has(signalId)) {
			next.delete(signalId);
		} else {
			next.add(signalId);
		}
		expanded.value = next;
	};

	const exportInsights = () => {
		copyToClipboard(JSON.stringify(insights, null, 2));
		exportStatus.value = "Copied to clipboard!";
		setTimeout(() => {
			exportStatus.value = undefined;
		}, 2000);
	};

	const baselineIsDefensible =
		insights.hotspotPopulation >= MIN_BASELINE_POPULATION;
	const noHotspotsMessage = baselineIsDefensible
		? `No runtime instance is disproportionately active relative to the median baseline (≥2×). The median per-instance update count is ${insights.hotspotBaseline} across ${insights.hotspotPopulation} identified instance${insights.hotspotPopulation === 1 ? "" : "s"}.`
		: "Not enough identified instances to compute a defensible median baseline. Update more tracked Signals to populate hotspots.";

	return (
		<div className="performance-insights">
			<header className="performance-insights-header">
				<div>
					<h2>Performance Insights</h2>
					<p>
						Metrics use a rolling window of the last{" "}
						{PERFORMANCE_OBSERVATION_LIMIT} observed update events. Clear resets
						the window.
					</p>
				</div>
				<div className="performance-export">
					<button
						className="performance-export-button"
						onClick={exportInsights}
						title="Copy performance insights as JSON"
					>
						↓ Export JSON
					</button>
					<span
						className="performance-export-status"
						role="status"
						aria-live="polite"
					>
						{exportStatus.value}
					</span>
				</div>
			</header>

			<div className="performance-insights-content">
				<section
					className="performance-section"
					aria-labelledby="hotspots-heading"
				>
					<div className="performance-section-heading">
						<div>
							<h3 id="hotspots-heading">Hotspots</h3>
							<p>
								A hotspot is a runtime instance whose observed update count is
								disproportionate to the median per-instance activity. Only
								instances at ≥2× the median baseline are shown; ≥4× is flagged
								as severe. Instances are ranked by observed update events for
								each runtime instance ID, not by display name. This measures
								activity, not elapsed time.
							</p>
						</div>
						<span className="performance-section-count">
							{insights.observationCount} observed
						</span>
					</div>

					{insights.observationCount === 0 ? (
						<p className="performance-empty">
							Update a tracked Signal to collect performance observations.
						</p>
					) : insights.hotspots.length === 0 ? (
						<p className="performance-empty">{noHotspotsMessage}</p>
					) : (
						<div className="performance-table-scroll">
							<table className="performance-table">
								<thead>
									<tr>
										<th>Instance</th>
										<th>Type</th>
										<th>Tier</th>
										<th>Observed events</th>
										<th>vs. baseline</th>
									</tr>
								</thead>
								<tbody>
									<VisibleRows items={insights.hotspots} colSpan={5}>
										{summary => (
											<tr key={summary.signalId}>
												<td>
													<InstanceCell summary={summary} />
												</td>
												<td>{summary.signalType}</td>
												<td>
													<HotspotTierBadge tier={summary.hotspotTier} />
												</td>
												<td>{summary.updateCount}</td>
												<td>
													{insights.hotspotBaseline > 0
														? `${(summary.updateCount / insights.hotspotBaseline).toFixed(1)}× median`
														: "—"}
												</td>
											</tr>
										)}
									</VisibleRows>
								</tbody>
							</table>
						</div>
					)}
					{insights.hotspotPopulation >= MIN_BASELINE_POPULATION && (
						<p className="performance-note">
							Baseline: median of {insights.hotspotBaseline} observed update
							event{insights.hotspotBaseline === 1 ? "" : "s"} per instance
							across {insights.hotspotPopulation} identified instance
							{insights.hotspotPopulation === 1 ? "" : "s"}.
						</p>
					)}
					{insights.unidentifiedObservationCount > 0 && (
						<p className="performance-note">
							{insights.unidentifiedObservationCount} observed event
							{insights.unidentifiedObservationCount === 1 ? "" : "s"} lacked a
							runtime instance ID and{" "}
							{insights.unidentifiedObservationCount === 1 ? "was" : "were"}{" "}
							excluded rather than merged by name.
						</p>
					)}
				</section>

				<section
					className="performance-section"
					aria-labelledby="redundant-work-heading"
				>
					<div className="performance-section-heading">
						<div>
							<h3 id="redundant-work-heading">Redundant Work</h3>
							<p>
								A counted entry is an instrumented computed recomputation with{" "}
								<code>outputChanged: false</code>. It does not compare
								serialized values and does not claim the recomputation was
								avoidable. Expand a row to inspect recent occurrences, their
								trigger source, and current dependencies — all taken verbatim
								from the runtime observation.
							</p>
						</div>
					</div>

					{insights.redundantWork.length === 0 ? (
						<p className="performance-empty">
							No computed recomputations without an output change in this
							observation window.
						</p>
					) : (
						<div className="performance-table-scroll">
							<table className="performance-table">
								<thead>
									<tr>
										<th>Computed instance</th>
										<th>No-output-change</th>
										<th>All recomputations</th>
										<th>Rate</th>
									</tr>
								</thead>
								<tbody>
									<VisibleRows items={insights.redundantWork} colSpan={4}>
										{summary => {
											const isOpen = expanded.value.has(summary.signalId);
											return (
												<Fragment key={summary.signalId}>
													<tr
														className={`performance-expandable-row${isOpen ? " expanded" : ""}`}
													>
														<td>
															<div className="performance-instance-with-toggle">
																<InstanceCell summary={summary} />
																<button
																	className="performance-expand-toggle"
																	onClick={() => toggleRow(summary.signalId)}
																	aria-expanded={isOpen}
																	aria-label={`${isOpen ? "Hide" : "Inspect"} recent causes for ${summary.signalName || "anonymous computed"}`}
																>
																	<span aria-hidden="true">
																		{isOpen ? "▼" : "▶"}
																	</span>
																</button>
															</div>
														</td>
														<td>{summary.noOutputChangeCount}</td>
														<td>{summary.recomputationCount}</td>
														<td>
															{summary.recomputationCount > 0
																? `${Math.round(
																		(summary.noOutputChangeCount /
																			summary.recomputationCount) *
																			100
																	)}%`
																: "—"}
														</td>
													</tr>
													{isOpen && (
														<tr className="performance-occurrence-detail">
															<td colSpan={4}>
																<div className="performance-occurrence-detail-inner">
																	<h4>
																		Recent no-output-change recomputations
																	</h4>
																	{summary.recentOccurrences &&
																	summary.recentOccurrences.length > 0 ? (
																		<ol className="performance-occurrence-list">
																			{summary.recentOccurrences.map(
																				(occurrence, index) => (
																					<OccurrenceRow
																						key={`${occurrence.signalId}-${occurrence.receivedAt}-${index}`}
																						occurrence={occurrence}
																					/>
																				)
																			)}
																		</ol>
																	) : (
																		<p className="performance-muted">
																			No occurrence metadata retained for this
																			instance.
																		</p>
																	)}
																</div>
															</td>
														</tr>
													)}
												</Fragment>
											);
										}}
									</VisibleRows>
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
