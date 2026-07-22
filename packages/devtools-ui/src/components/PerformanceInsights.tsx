import type { ComponentChildren } from "preact";
import { getContext } from "../context";
import type { PerformanceInstanceSummary } from "../models/PerformanceInsightsModel";
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

export function PerformanceInsights() {
	const { performanceStore } = getContext();
	const insights = performanceStore.insights.value;

	return (
		<div className="performance-insights">
			<header className="performance-insights-header">
				<h2>Performance Insights</h2>
				<p>
					Metrics use a rolling window of the last{" "}
					{PERFORMANCE_OBSERVATION_LIMIT} observed update events. Clear resets
					the window.
				</p>
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
								Ranked by observed update events for each runtime instance ID,
								not by display name. This measures activity, not elapsed time.
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
					) : (
						<div className="performance-table-scroll">
							<table className="performance-table">
								<thead>
									<tr>
										<th>Instance</th>
										<th>Type</th>
										<th>Observed events</th>
										<th>No-output-change recomputations</th>
									</tr>
								</thead>
								<tbody>
									<VisibleRows items={insights.hotspots} colSpan={4}>
										{summary => (
											<tr key={summary.signalId}>
												<td>
													<InstanceCell summary={summary} />
												</td>
												<td>{summary.signalType}</td>
												<td>{summary.updateCount}</td>
												<td>{summary.noOutputChangeCount}</td>
											</tr>
										)}
									</VisibleRows>
								</tbody>
							</table>
						</div>
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
								avoidable.
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
										{summary => (
											<tr key={summary.signalId}>
												<td>
													<InstanceCell summary={summary} />
												</td>
												<td>{summary.noOutputChangeCount}</td>
												<td>{summary.recomputationCount}</td>
												<td>
													{Math.round(
														(summary.noOutputChangeCount /
															summary.recomputationCount) *
															100
													)}
													%
												</td>
											</tr>
										)}
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
