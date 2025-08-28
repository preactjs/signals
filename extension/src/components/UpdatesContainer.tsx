import { useRef } from "preact/hooks";
import { updatesStore, type UpdateTreeNode } from "../models/UpdatesModel";
import { UpdateTreeNodeComponent } from "./UpdateTreeNode";
import { useSignalEffect } from "@preact/signals";
import { settingsStore } from "../models/SettingsModel";

const nodesAreEqual = (a: UpdateTreeNode, b: UpdateTreeNode): boolean => {
	return (
		a.update.signalId === b.update.signalId &&
		a.children.length === b.children.length &&
		a.children.every((child, index) => nodesAreEqual(child, b.children[index]))
	);
};

interface CollapsedTree {
	tree: UpdateTreeNode[];
	counts: WeakMap<UpdateTreeNode, number>;
}

const collapseTree = (nodes: UpdateTreeNode[]): CollapsedTree => {
	const tree: UpdateTreeNode[] = [];
	let lastNode: UpdateTreeNode | null = null;
	const counts = new WeakMap<UpdateTreeNode, number>();

	for (const node of nodes) {
		if (lastNode && nodesAreEqual(lastNode, node)) {
			// If the current node is equal to the last one, skip it
			counts.set(lastNode, (counts.get(lastNode) ?? 1) + 1);
			continue;
		}
		tree.push(node);
		lastNode = node;
	}

	return { tree, counts };
};

export function UpdatesContainer() {
	const updatesListRef = useRef<HTMLDivElement>(null);
	const updateTree = updatesStore.updateTree.value;
	let collapsedTree = updateTree;
	let counts: WeakMap<UpdateTreeNode, number> | undefined;
	if (settingsStore.settings.grouped) {
		({ tree: collapsedTree, counts } = collapseTree(updateTree));
	}

	useSignalEffect(() => {
		// Register scroll restoration
		// When a new update is added we scroll to top
		const tree = updatesStore.updateTree.value;
		if (updatesListRef.current) {
			updatesListRef.current.scrollTop = 0;
		}
	});

	return (
		<div className="updates-container">
			<div className="updates-header">
				<div className="updates-stats">
					<span>
						Updates: <strong>{updatesStore.totalUpdates.value}</strong>
					</span>
					<span>
						Signals: <strong>{updatesStore.signalCounts.value.size}</strong>
					</span>
				</div>
			</div>

			<div className="updates-list" ref={updatesListRef}>
				{collapsedTree.map(node => (
					<UpdateTreeNodeComponent
						key={node.id}
						node={node}
						count={counts?.get(node)}
					/>
				))}
			</div>
		</div>
	);
}
