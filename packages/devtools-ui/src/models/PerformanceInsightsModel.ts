import { computed, createModel } from "@preact/signals";
import type {
	PerformanceObservation,
	SignalUpdate,
	UpdatesModel,
} from "./UpdatesModel";

export interface PerformanceInstanceSummary {
	/** Stable runtime identity emitted by the debug runtime. */
	signalId: string;
	signalName: string;
	signalType: SignalUpdate["signalType"];
	/** Number of observed update events for this instance in the rolling window. */
	updateCount: number;
	/** Number of explicitly instrumented computed evaluations. */
	recomputationCount: number;
	/** Computed evaluations whose output did not change according to the runtime. */
	noOutputChangeCount: number;
	lastObservedAt: number;
}

export interface PerformanceInsightsData {
	/** Instances ranked by observed update activity, never by display name. */
	hotspots: PerformanceInstanceSummary[];
	/** Computed instances with one or more no-output-change recomputations. */
	redundantWork: PerformanceInstanceSummary[];
	observationCount: number;
	unidentifiedObservationCount: number;
}

const byMostRecentActivity = (
	a: PerformanceInstanceSummary,
	b: PerformanceInstanceSummary
) =>
	b.updateCount - a.updateCount ||
	b.lastObservedAt - a.lastObservedAt ||
	a.signalId.localeCompare(b.signalId);

const byMostRedundantWork = (
	a: PerformanceInstanceSummary,
	b: PerformanceInstanceSummary
) =>
	b.noOutputChangeCount - a.noOutputChangeCount ||
	b.recomputationCount - a.recomputationCount ||
	b.lastObservedAt - a.lastObservedAt ||
	a.signalId.localeCompare(b.signalId);

/**
 * Aggregates only stable runtime IDs. Events without an ID are deliberately not
 * merged by label, because two unrelated Signals may share a display name.
 */
export function derivePerformanceInsights(
	observations: PerformanceObservation[]
): PerformanceInsightsData {
	const instances = new Map<string, PerformanceInstanceSummary>();
	let unidentifiedObservationCount = 0;

	for (const observation of observations) {
		if (!observation.signalId) {
			unidentifiedObservationCount++;
			continue;
		}

		let summary = instances.get(observation.signalId);
		if (!summary) {
			summary = {
				signalId: observation.signalId,
				signalName: observation.signalName,
				signalType: observation.signalType,
				updateCount: 0,
				recomputationCount: 0,
				noOutputChangeCount: 0,
				lastObservedAt: observation.timestamp ?? observation.receivedAt,
			};
			instances.set(observation.signalId, summary);
		}

		summary.updateCount++;
		summary.lastObservedAt = Math.max(
			summary.lastObservedAt,
			observation.timestamp ?? observation.receivedAt
		);

		if (observation.recomputed) {
			summary.recomputationCount++;
			if (observation.outputChanged === false) {
				summary.noOutputChangeCount++;
			}
		}
	}

	const hotspots = Array.from(instances.values()).sort(byMostRecentActivity);
	return {
		hotspots,
		redundantWork: hotspots
			.filter(summary => summary.noOutputChangeCount > 0)
			.sort(byMostRedundantWork),
		observationCount: observations.length,
		unidentifiedObservationCount,
	};
}

export const PerformanceInsightsModel = createModel(
	(updatesStore: InstanceType<typeof UpdatesModel>) => ({
		insights: computed(() =>
			derivePerformanceInsights(updatesStore.performanceObservations.value)
		),
	})
);
