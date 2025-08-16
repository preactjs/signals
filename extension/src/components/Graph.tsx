import { useRef } from "preact/hooks";
import { Signal, computed } from "@preact/signals";
import {
	Divider,
	GraphData,
	GraphLink,
	GraphNode,
	ComponentGroup,
	SignalUpdate,
} from "../types";
import { updatesStore } from "../models/UpdatesModel";

export function GraphVisualization() {
	const updates = updatesStore.updates;
	const svgRef = useRef<SVGSVGElement>(null);

	// Build graph data from updates signal using a computed
	const graphData = computed<GraphData>(() => {
		const rawUpdates = updates.value;
		if (!rawUpdates || rawUpdates.length === 0)
			return { nodes: [], links: [], components: [] };

		const nodes = new Map<string, GraphNode>();
		const links = new Map<string, GraphLink>();

		// Process updates to build graph structure
		const signalUpdates = rawUpdates.filter(
			update => update.type !== "divider"
		) as SignalUpdate[];

		const componentNodes = new Set<string>();

		for (const update of signalUpdates) {
			if (!update.signalId) continue;
			const type: "signal" | "computed" | "effect" = update.signalType;
			const currentDepth = update.depth || 0;

			if (!nodes.has(update.signalId)) {
				nodes.set(update.signalId, {
					id: update.signalId,
					name: update.signalName,
					type,
					x: 0,
					y: 0,
					depth: currentDepth,
				});
			}

			if (update.subscribedTo) {
				const linkKey = `${update.subscribedTo}->${update.signalId}`;
				if (!links.has(linkKey)) {
					links.set(linkKey, {
						source: update.subscribedTo,
						target: update.signalId,
					});
				}
			}

			// Create component nodes for each component that will rerender
			if (update.componentNames && update.componentNames.length > 0) {
				for (const componentName of update.componentNames) {
					const componentId = `component:${componentName}`;
					componentNodes.add(componentId);

					if (!nodes.has(componentId)) {
						nodes.set(componentId, {
							id: componentId,
							name: componentName,
							type: "component",
							x: 0,
							y: 0,
							depth: currentDepth + 1, // Components are one level deeper than the signal that triggers them
						});
					}

					// Create link from signal to component rerender
					const rerenderLinkKey = `${update.signalId}->${componentId}`;
					if (!links.has(rerenderLinkKey)) {
						links.set(rerenderLinkKey, {
							source: update.signalId,
							target: componentId,
						});
					}
				}
			}
		}

		// Simple depth-based layout
		const allNodes = Array.from(nodes.values());
		const nodeSpacing = 120; // More spacing between nodes
		const depthSpacing = 250; // Distance between depth levels
		const startX = 100;
		const startY = 80;

		// Group nodes by depth
		const nodesByDepth = new Map<number, GraphNode[]>();
		allNodes.forEach(node => {
			if (!nodesByDepth.has(node.depth)) {
				nodesByDepth.set(node.depth, []);
			}
			nodesByDepth.get(node.depth)!.push(node);
		});

		// Layout nodes by depth, centering each depth level vertically
		const maxDepth = Math.max(...allNodes.map(n => n.depth));
		nodesByDepth.forEach((depthNodes, depth) => {
			const depthHeight = (depthNodes.length - 1) * nodeSpacing;
			const depthStartY = startY + maxDepth * 100 - depthHeight / 2; // Center this depth level

			depthNodes.forEach((node, index) => {
				node.x = startX + depth * depthSpacing;
				node.y = depthStartY + index * nodeSpacing;
			});
		});

		const components: ComponentGroup[] = []; // Remove component grouping for now

		return {
			nodes: allNodes,
			links: Array.from(links.values()),
			components,
		};
	});

	if (graphData.value.nodes.length === 0) {
		return (
			<div className="graph-empty">
				<div>
					<h3>No Signal Dependencies</h3>
					<p>
						Create some signals with dependencies to see the graph
						visualization.
					</p>
				</div>
			</div>
		);
	}

	// Calculate SVG dimensions based on nodes
	const svgWidth = Math.max(800, ...graphData.value.nodes.map(n => n.x + 100));
	const svgHeight = Math.max(600, ...graphData.value.nodes.map(n => n.y + 100));

	return (
		<div className="graph-container">
			<div className="graph-content">
				<svg
					ref={svgRef}
					className="graph-svg"
					width={svgWidth}
					height={svgHeight}
					viewBox={`0 0 ${svgWidth} ${svgHeight}`}
				>
					{/* Arrow marker definition */}
					<defs>
						<marker
							id="arrowhead"
							markerWidth="10"
							markerHeight="7"
							refX="9"
							refY="3.5"
							orient="auto"
						>
							<polygon points="0 0, 10 3.5, 0 7" fill="#666" />
						</marker>
					</defs>

					{/* Links */}
					<g className="links">
						{graphData.value.links.map((link, index) => {
							const sourceNode = graphData.value.nodes.find(
								n => n.id === link.source
							);
							const targetNode = graphData.value.nodes.find(
								n => n.id === link.target
							);

							if (!sourceNode || !targetNode) return null;

							// Use curved paths for better visual flow
							const sourceX = sourceNode.x + 25;
							const sourceY = sourceNode.y;
							const targetX = targetNode.x - 25;
							const targetY = targetNode.y;

							const midX = sourceX + (targetX - sourceX) * 0.6;
							const pathData = `M ${sourceX} ${sourceY} Q ${midX} ${sourceY} ${targetX} ${targetY}`;

							return (
								<path
									key={`link-${index}`}
									className="graph-link"
									d={pathData}
									fill="none"
									stroke="#666"
									strokeWidth="2"
									markerEnd="url(#arrowhead)"
								/>
							);
						})}
					</g>

					{/* Nodes */}
					<g className="nodes">
						{graphData.value.nodes.map(node => {
							const radius = node.type === "component" ? 35 : 25;
							const displayName =
								node.name.length > 10
									? node.name.slice(0, 10) + "..."
									: node.name;

							return (
								<g key={node.id} className="graph-node-group">
									{node.type === "component" ? (
										// Rectangular shape for components
										<rect
											className={`graph-node ${node.type}`}
											x={node.x - radius}
											y={node.y - 20}
											width={radius * 2}
											height={40}
											rx="8"
										/>
									) : (
										// Circular shape for signals/computed/effects
										<circle
											className={`graph-node ${node.type}`}
											cx={node.x}
											cy={node.y}
											r={radius}
										/>
									)}
									<text
										className="graph-text"
										x={node.x}
										y={node.y + 4}
										textAnchor="middle"
										fontSize="12"
										fontWeight="bold"
									>
										{displayName}
									</text>
								</g>
							);
						})}
					</g>
				</svg>

				{/* Legend */}
				<div className="graph-legend">
					<div className="legend-item">
						<div
							className="legend-color"
							style={{ backgroundColor: "#2196f3" }}
						></div>
						<span>Signal</span>
					</div>
					<div className="legend-item">
						<div
							className="legend-color"
							style={{ backgroundColor: "#ff9800" }}
						></div>
						<span>Computed</span>
					</div>
					<div className="legend-item">
						<div
							className="legend-color"
							style={{ backgroundColor: "#4caf50" }}
						></div>
						<span>Effect</span>
					</div>
					<div className="legend-item">
						<div
							className="legend-color"
							style={{ backgroundColor: "#9c27b0" }}
						></div>
						<span>Component</span>
					</div>
				</div>
			</div>
		</div>
	);
}
