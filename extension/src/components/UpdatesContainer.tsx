import { useRef } from "preact/hooks";
import { updatesStore } from "../models/UpdatesModel";
import { UpdateTreeNodeComponent } from "./UpdateTreeNode";
import { useSignalEffect } from "@preact/signals";

export function UpdatesContainer() {
	const updatesListRef = useRef<HTMLDivElement>(null);
	const updateTree = updatesStore.collapsedUpdateTree.value;

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
				{updateTree.map(node => (
					<UpdateTreeNodeComponent key={node.id} node={node} />
				))}
			</div>
		</div>
	);
}
