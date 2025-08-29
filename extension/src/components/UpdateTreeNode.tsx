import { useSignal } from "@preact/signals";
import { UpdateTreeNode } from "../models/UpdatesModel";
import { UpdateItem } from "./UpdateItem";

interface UpdateTreeNodeProps {
	node: UpdateTreeNode;
}

export function UpdateTreeNodeComponent({ node }: UpdateTreeNodeProps) {
	const isCollapsed = useSignal(false);

	const toggleCollapse = () => {
		isCollapsed.value = !isCollapsed.value;
	};

	const hasChildren = node.children.length > 0;
	const nodeCount = node.type === "group" ? node.count : undefined;
	const firstUpdate = node.type === "group" ? node.firstUpdate : undefined;

	return (
		<div className="tree-node">
			<div className="tree-node-content">
				{hasChildren && (
					<button
						className="collapse-button"
						onClick={toggleCollapse}
						aria-label={isCollapsed.value ? "Expand" : "Collapse"}
					>
						{isCollapsed.value ? "▶" : "▼"}
					</button>
				)}
				{!hasChildren && <div className="collapse-spacer" />}
				<div className="update-content">
					<UpdateItem
						update={node.update}
						count={nodeCount}
						firstUpdate={firstUpdate}
					/>
				</div>
			</div>

			{hasChildren && !isCollapsed.value && (
				<div className="tree-children">
					{node.children.map(child => (
						<UpdateTreeNodeComponent key={child.id} node={child} />
					))}
				</div>
			)}
		</div>
	);
}
