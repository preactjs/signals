import { computed, createModel } from "@preact/signals";
import type { DependencyInfo } from "@preact/signals-devtools-adapter";
import type {
	PerformanceObservation,
	SignalUpdate,
	UpdatesModel,
} from "./UpdatesModel";

/**
 * A single retained no-output-change recomputation, kept so developers can
 * inspect what triggered it. Identity and dependency fields are copied
 * verbatim from the runtime observation — values are never compared to infer
 * whether the output changed.
 */
export interface NoOutputChangeOccurrence {
	/** Stable runtime identity of the computed that recomputed. */
	signalId: string;
	signalName: string;
	/** Source/trigger signal identity from `subscribedTo`, when available. */
	subscribedTo?: string;
	/** Current dependency names/IDs/types from `allDependencies`, when available. */
	allDependencies?: DependencyInfo[];
	/** Runtime timestamp of the recomputation, when available. */
	timestamp?: number;
	/** Wall-clock time the devtools received the observation. */
	receivedAt: number;
}

export type HotspotTier = "elevated" | "severe";

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
	/** Hotspot tier relative to the median baseline; only set for hotspot rows. */
	hotspotTier?: HotspotTier;
	/**
	 * Recent no-output-change recomputations (most recent first), bounded by
	 * `MAX_RECENT_OCCURRENCES`. Only populated for redundant-work entries.
	 */
	recentOccurrences?: NoOutputChangeOccurrence[];
}

export interface PerformanceInsightsData {
	/**
	 * Instances whose observed update count is disproportionate to the median
	 * per-instance baseline (>=2x). `severe` tier entries are >=4x. Never ranked
	 * by display name.
	 */
	hotspots: PerformanceInstanceSummary[];
	/** Computed instances with one or more no-output-change recomputations. */
	redundantWork: PerformanceInstanceSummary[];
	observationCount: number;
	unidentifiedObservationCount: number;
	/** Median per-instance observed update count used as the hotspot baseline. */
	hotspotBaseline: number;
	/** Number of identified instances the baseline was computed over. */
	hotspotPopulation: number;
}

/** Maximum recent occurrences retained per redundant-work instance. */
export const MAX_RECENT_OCCURRENCES = 10;

/** A population smaller than this cannot support a defensible baseline. */
export const MIN_BASELINE_POPULATION = 2;

const HOTSPOT_ELEVATED_MULTIPLIER = 2;
const HOTSPOT_SEVERE_MULTIPLIER = 4;

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
 * Median of a list of numbers. Returns 0 for an empty list. Uses the average
 * of the two middle values for even-length lists.
 */
function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Aggregates only stable runtime IDs. Events without an ID are deliberately not
 * merged by label, because two unrelated Signals may share a display name.
 *
 * Hotspots are filtered against the median per-instance update count so that
 * only instances whose activity is disproportionate (>=2x baseline) appear.
 * No-output-change entries retain verbatim runtime identity and dependency
 * metadata from the observation — output-change status is never inferred from
 * serialized value equality.
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
				// Retain verbatim runtime metadata for later inspection. Values are
				// intentionally not stored — output-change status comes from the
				// runtime's `!==` check, not from serialized equality here.
				const occurrence: NoOutputChangeOccurrence = {
					signalId: observation.signalId,
					signalName: observation.signalName,
					subscribedTo: observation.subscribedTo,
					allDependencies: observation.allDependencies,
					timestamp: observation.timestamp,
					receivedAt: observation.receivedAt,
				};
				if (!summary.recentOccurrences) {
					summary.recentOccurrences = [];
				}
				summary.recentOccurrences.push(occurrence);
			}
		}
	}

	const population = instances.size;
	const baseline =
		population >= MIN_BASELINE_POPULATION
			? median(Array.from(instances.values(), summary => summary.updateCount))
			: 0;

	const hotspots: PerformanceInstanceSummary[] = [];
	if (population >= MIN_BASELINE_POPULATION && baseline > 0) {
		const elevatedThreshold = baseline * HOTSPOT_ELEVATED_MULTIPLIER;
		const severeThreshold = baseline * HOTSPOT_SEVERE_MULTIPLIER;
		for (const summary of instances.values()) {
			if (summary.updateCount >= severeThreshold) {
				hotspots.push({
					...summary,
					recentOccurrences: undefined,
					hotspotTier: "severe",
				});
			} else if (summary.updateCount >= elevatedThreshold) {
				hotspots.push({
					...summary,
					recentOccurrences: undefined,
					hotspotTier: "elevated",
				});
			}
		}
		hotspots.sort(byMostRecentActivity);
	}

	const redundantWork = Array.from(instances.values())
		.filter(summary => summary.noOutputChangeCount > 0)
		.map(summary => ({
			...summary,
			// Keep only the most recent occurrences, most-recent-first.
			recentOccurrences: summary.recentOccurrences
				? summary.recentOccurrences.slice(-MAX_RECENT_OCCURRENCES).reverse()
				: undefined,
		}))
		.sort(byMostRedundantWork);

	return {
		hotspots,
		redundantWork,
		observationCount: observations.length,
		unidentifiedObservationCount,
		hotspotBaseline: baseline,
		hotspotPopulation: population,
	};
}

export const PerformanceInsightsModel = createModel(
	(updatesStore: InstanceType<typeof UpdatesModel>) => ({
		insights: computed(() =>
			derivePerformanceInsights(updatesStore.performanceObservations.value)
		),
	})
);
