import { effect, signal, computed, createModel } from "@preact/signals";
import type {
	DevToolsAdapter,
	SignalDisposed,
	SignalUpdate as AdapterSignalUpdate,
	DependencyInfo,
} from "@preact/signals-devtools-adapter";
import type { SettingsModel } from "./SettingsModel";

export interface SignalUpdate extends AdapterSignalUpdate {
	/** When this update reached the DevTools UI. */
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
	/** All dependencies this computed/effect currently depends on (with rich info) */
	allDependencies?: DependencyInfo[];
	/** Present when this entry was produced by a computed evaluation. */
	recomputed?: true;
	/** Whether that computed evaluation changed its output using the runtime's `!==` check. */
	outputChanged?: boolean;
	/** Stable identity for this occurrence in the DevTools session. */
	timelineId?: string;
	/** The runtime callback/cascade that delivered this update. */
	cascadeId?: string;
	/** Monotonically increasing order in which the UI received this update. */
	sequence?: number;
}

/** Upper bound on retained cascade batches so memory stays bounded while the
 * Timeline still keeps enough history for filtering/focus to be useful. */
export const MAX_TIMELINE_BATCHES = 500;

export interface TimelineUpdate extends SignalUpdate {
	timelineId: string;
	cascadeId: string;
	sequence: number;
}

/** A runtime callback is a cascade: its updates are kept together and ordered. */
export interface TimelineBatch {
	id: string;
	receivedAt: number;
	updates: TimelineUpdate[];
}

export type Divider = { type: "divider" };

/** A single event retained for the bounded Performance Insights observation window. */
export type PerformanceObservation = SignalUpdate;

export const PERFORMANCE_OBSERVATION_LIMIT = 1000;

export interface UpdateTreeNodeBase {
	id: string;
	update: SignalUpdate;
	children: UpdateTreeNode[];
	depth: number;
	hasChildren: boolean;
}

export interface UpdateTreeNodeSingle extends UpdateTreeNodeBase {
	type: "single";
}

export interface UpdateTreeNodeGroup extends UpdateTreeNodeBase {
	type: "group";
	count: number;
	firstUpdate: SignalUpdate;
	firstChildren: UpdateTreeNode[];
}

export type UpdateTreeNode = UpdateTreeNodeGroup | UpdateTreeNodeSingle;

const nodesAreEqual = (a: UpdateTreeNode, b: UpdateTreeNode): boolean => {
	return (
		a.update.signalId === b.update.signalId &&
		a.children.length === b.children.length &&
		a.children.every((child, index) => nodesAreEqual(child, b.children[index]))
	);
};

const collapseTree = (nodes: UpdateTreeNodeSingle[]): UpdateTreeNode[] => {
	const tree: UpdateTreeNode[] = [];
	let lastNode: UpdateTreeNode | undefined;

	for (const node of nodes) {
		if (lastNode && nodesAreEqual(lastNode, node)) {
			if (lastNode.type !== "group") {
				tree.pop();
				lastNode = {
					...lastNode,
					type: "group",
					count: 2,
					firstUpdate: node.update,
					firstChildren: node.children,
				};
				tree.push(lastNode);
			} else {
				lastNode.count++;
				lastNode.firstUpdate = node.update;
				lastNode.firstChildren = node.children;
			}
			continue;
		}
		tree.push(node);
		lastNode = node;
	}

	return tree;
};

export const UpdatesModel = createModel(
	(
		adapter: DevToolsAdapter,
		settingsStore: InstanceType<typeof SettingsModel>
	) => {
		const updates = signal<(SignalUpdate | Divider)[]>([]);
		const performanceObservations = signal<PerformanceObservation[]>([]);
		const timelineBatches = signal<TimelineBatch[]>([]);
		const isPaused = signal<boolean>(false);
		const disposedSignalIds = signal<Set<string>>(new Set());
		let nextTimelineId = 0;
		let nextCascadeId = 0;

		const addUpdate = (
			update: SignalUpdate | Divider | Array<SignalUpdate | Divider>
		) => {
			const receivedAt = Date.now();
			const items = Array.isArray(update) ? update : [update];
			updates.value = [
				...updates.value,
				...items.map(item =>
					item.type === "divider" ? item : { ...item, receivedAt }
				),
			];
		};

		const addTimelineBatch = (signalUpdates: AdapterSignalUpdate[]) => {
			if (signalUpdates.length === 0) return;

			const receivedAt = Date.now();
			const id = `cascade-${++nextCascadeId}`;
			const batch: TimelineBatch = {
				id,
				receivedAt,
				updates: signalUpdates.map(update => ({
					...update,
					receivedAt,
					timelineId: `update-${++nextTimelineId}`,
					cascadeId: id,
					sequence: nextTimelineId,
				})),
			};

			const nextBatches = [...timelineBatches.value, batch];
			timelineBatches.value = nextBatches.slice(-MAX_TIMELINE_BATCHES);
			// Keep the existing Updates tree newest-first without mutating adapter data.
			// No-output-change recomputations are performance observations, not
			// visible value updates, so keep the Updates and Graph views focused on
			// externally observable output changes.
			const visibleUpdates = batch.updates.filter(
				update => !update.recomputed || update.outputChanged !== false
			);
			if (visibleUpdates.length > 0) {
				const treeUpdates: Array<SignalUpdate | Divider> = [
					...visibleUpdates,
				].reverse();
				treeUpdates.push({ type: "divider" });
				addUpdate(treeUpdates);
			}
		};

		const addPerformanceBatch = (signalUpdates: SignalUpdate[]) => {
			const receivedAt = Date.now();
			const observations = signalUpdates.map(update => ({
				...update,
				receivedAt,
			}));

			performanceObservations.value = [
				...performanceObservations.value,
				...observations,
			].slice(-PERFORMANCE_OBSERVATION_LIMIT);
		};

		const addDisposal = (disposal: SignalDisposed | SignalDisposed[]) => {
			const disposals = Array.isArray(disposal) ? disposal : [disposal];
			const newDisposed = new Set(disposedSignalIds.value);
			for (const d of disposals) {
				if (d.signalId) {
					newDisposed.add(d.signalId);
				}
			}
			disposedSignalIds.value = newDisposed;
		};

		const hasUpdates = computed(() => updates.value.length > 0);

		const signalCounts = computed(() => {
			const counts = new Map<string, number>();
			updates.value.forEach(update => {
				if (update.type === "divider") return;
				const signalName = update.signalName || "Unknown";
				counts.set(signalName, (counts.get(signalName) || 0) + 1);
			});
			return counts;
		});

		const updateTree = computed(() => {
			const buildTree = (
				updates: (SignalUpdate | Divider)[]
			): UpdateTreeNodeSingle[] => {
				const tree: UpdateTreeNodeSingle[] = [];
				const stack: UpdateTreeNodeSingle[] = [];

				const recentUpdates = updates.slice(-100).reverse();

				for (let i = 0; i < recentUpdates.length; i++) {
					const item = recentUpdates[i];

					if (item.type === "divider") {
						continue;
					}

					const update = item as SignalUpdate;
					const depth = update.depth || 0;

					const nodeId = `${update.signalName}-${update.receivedAt}-${i}`;

					const node: UpdateTreeNodeSingle = {
						type: "single",
						id: nodeId,
						update,
						children: [],
						depth,
						hasChildren: false,
					};

					while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
						stack.pop();
					}

					if (stack.length === 0) {
						tree.push(node);
					} else {
						const parent = stack[stack.length - 1];
						parent.children.push(node);
						parent.hasChildren = true;
					}

					stack.push(node);
				}

				return tree;
			};

			return buildTree(updates.value);
		});

		const clearUpdates = () => {
			updates.value = [];
			performanceObservations.value = [];
			timelineBatches.value = [];
			disposedSignalIds.value = new Set();
		};

		effect(() => {
			const unsubscribeSignalUpdate = adapter.on(
				"signalUpdate",
				(signalUpdates: AdapterSignalUpdate[]) => {
					if (isPaused.value) return;

					addPerformanceBatch(signalUpdates);
					addTimelineBatch(signalUpdates);
				}
			);

			const unsubscribeSignalDisposed = adapter.on(
				"signalDisposed",
				(disposals: SignalDisposed[]) => {
					if (isPaused.value) return;
					addDisposal(disposals);
				}
			);

			return () => {
				unsubscribeSignalUpdate();
				unsubscribeSignalDisposed();
			};
		});

		const collapsedUpdateTree = computed(() => {
			const updateTreeValue = updateTree.value;
			if (settingsStore.settings.value.grouped) {
				return collapseTree(updateTreeValue);
			}
			return updateTreeValue;
		});

		return {
			updates,
			performanceObservations,
			timelineBatches,
			updateTree,
			collapsedUpdateTree,
			totalUpdates: computed(() => Object.keys(updateTree.value).length),
			signalCounts,
			disposedSignalIds,
			addUpdate,
			clearUpdates,
			hasUpdates,
			isPaused,
		};
	}
);
