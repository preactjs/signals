import { effect, signal, computed, createModel } from "@preact/signals";
import type {
	DevToolsAdapter,
	SignalDisposed,
	DependencyInfo,
} from "@preact/signals-devtools-adapter";
import type { SettingsModel } from "./SettingsModel";

export interface SignalUpdate {
	type: "update" | "effect" | "component";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId?: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
	/** All dependencies this computed/effect currently depends on (with rich info) */
	allDependencies?: DependencyInfo[];
}

export type Divider = { type: "divider" };

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
		const isPaused = signal<boolean>(false);
		const disposedSignalIds = signal<Set<string>>(new Set());

		const addUpdate = (
			update: SignalUpdate | Divider | Array<SignalUpdate | Divider>
		) => {
			if (Array.isArray(update)) {
				update.forEach(item => {
					if (item.type !== "divider") item.receivedAt = Date.now();
				});
			} else if (update.type === "update") {
				update.receivedAt = Date.now();
			}
			updates.value = [
				...updates.value,
				...(Array.isArray(update) ? update : [update]),
			];
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
			disposedSignalIds.value = new Set();
		};

		effect(() => {
			const unsubscribeSignalUpdate = adapter.on(
				"signalUpdate",
				(signalUpdates: SignalUpdate[]) => {
					if (isPaused.value) return;

					const updatesArray: Array<SignalUpdate | Divider> = [
						...signalUpdates,
					].reverse();
					updatesArray.push({ type: "divider" });

					addUpdate(updatesArray);
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
