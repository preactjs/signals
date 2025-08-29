import { signal, computed, effect } from "@preact/signals";
import { Divider, SignalUpdate } from "../types";
import { settingsStore } from "./SettingsModel";

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
				// TODO (jg): maybe its safe to mutate lastNode instead of cloning?
				tree.pop();
				lastNode = {
					...lastNode,
					type: "group",
					count: 2,
					firstUpdate: node.update,
				};
				tree.push(lastNode);
			} else {
				lastNode.count++;
				lastNode.firstUpdate = node.update;
			}
			// If the current node is equal to the last one, skip it
			continue;
		}
		tree.push(node);
		lastNode = node;
	}

	return tree;
};

const createUpdatesModel = () => {
	const updates = signal<(SignalUpdate | Divider)[]>([]);
	const lastUpdateId = signal<number>(0);
	const isPaused = signal<boolean>(false);

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

			// Process updates in reverse order to show newest first
			const recentUpdates = updates.slice(-100).reverse();

			for (let i = 0; i < recentUpdates.length; i++) {
				const item = recentUpdates[i];

				// Skip dividers for tree building
				if (item.type === "divider") {
					continue;
				}

				const update = item as SignalUpdate;
				const depth = update.depth || 0;

				// Create a unique ID for this node
				const nodeId = `${update.signalName}-${update.receivedAt}-${i}`;

				const node: UpdateTreeNode = {
					type: "single",
					id: nodeId,
					update,
					children: [],
					depth,
					hasChildren: false,
				};

				// Find the correct parent based on depth
				while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
					stack.pop();
				}

				if (stack.length === 0) {
					// This is a root node
					tree.push(node);
				} else {
					// This is a child node
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
		lastUpdateId.value = 0;
	};

	effect(() => {
		if (isPaused.value) return;

		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) return;

			const { type, payload } = event.data;

			switch (type) {
				case "SIGNALS_UPDATE": {
					const signalUpdates = payload.updates;
					const updatesArray: Array<SignalUpdate | Divider> = Array.isArray(
						signalUpdates
					)
						? signalUpdates
						: [signalUpdates];

					updatesArray.reverse();
					updatesArray.push({ type: "divider" });

					updatesStore.addUpdate(updatesArray);
					break;
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	});

	const collapsedUpdateTree = computed(() => {
		const updateTreeValue = updateTree.value;
		if (settingsStore.settings.grouped) {
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
		addUpdate,
		clearUpdates,
		hasUpdates,
		isPaused,
	};
};

export const updatesStore = createUpdatesModel();
