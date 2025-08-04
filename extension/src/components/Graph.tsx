import { useEffect, useRef, useState } from "preact/hooks";
import {
	Divider,
	GraphData,
	GraphLink,
	GraphNode,
	ComponentGroup,
	SignalUpdate,
} from "../types";

export function GraphVisualization({
	updates,
}: {
	updates: (SignalUpdate | Divider)[];
}) {
	const [graphData, setGraphData] = useState<GraphData>({
		nodes: [],
		links: [],
		components: [],
	});
	const svgRef = useRef<SVGSVGElement>(null);

	// Build graph data from updates
	useEffect(() => {
		const nodes = new Map<string, GraphNode>();
		const links = new Map<string, GraphLink>();
		const depthMap = new Map<string, number>();

		// Process updates to build graph structure
		const signalUpdates = updates.filter(
			update => update.type !== "divider"
		) as SignalUpdate[];

		signalUpdates.forEach(update => {
			if (!update.signalId) return;

			// Determine signal type
			let type: "signal" | "computed" | "effect" = update.signalType;
			// Track depth
			const currentDepth = update.depth || 0;
			depthMap.set(update.signalId, currentDepth);

			// Add node
			if (!nodes.has(update.signalId)) {
				nodes.set(update.signalId, {
					id: update.signalId,
					name: update.signalName,
					type,
					x: 0,
					y: 0,
					depth: currentDepth,
					componentName: update.componentName || undefined,
				});
			}

			// Add link if this signal is subscribed to another
			if (update.subscribedTo) {
				const linkKey = `${update.subscribedTo}->${update.signalId}`;
				if (!links.has(linkKey)) {
					links.set(linkKey, {
						source: update.subscribedTo,
						target: update.signalId,
					});
				}
			}
		});

		// Group nodes by component
		const componentGroups = new Map<string, GraphNode[]>();
		const ungroupedNodes: GraphNode[] = [];

		nodes.forEach(node => {
			if (node.componentName) {
				if (!componentGroups.has(node.componentName)) {
					componentGroups.set(node.componentName, []);
				}
				componentGroups.get(node.componentName)!.push(node);
			} else {
				ungroupedNodes.push(node);
			}
		});

		// Layout nodes and create component groups
		const nodeSpacing = 80;
		const componentSpacing = 60;
		const depthSpacing = 300;
		const startX = 150;
		const startY = 100;
		let currentY = startY;

		const components: ComponentGroup[] = [];
		const allNodes: GraphNode[] = [];

		// Layout component groups
		componentGroups.forEach((componentNodes, componentName) => {
			// Group nodes by depth within component
			const nodesByDepth = new Map<number, GraphNode[]>();
			componentNodes.forEach(node => {
				if (!nodesByDepth.has(node.depth)) {
					nodesByDepth.set(node.depth, []);
				}
				nodesByDepth.get(node.depth)!.push(node);
			});

			const minDepth = Math.min(...componentNodes.map(n => n.depth));
			const maxDepth = Math.max(...componentNodes.map(n => n.depth));
			const componentWidth = (maxDepth - minDepth + 1) * depthSpacing + 100;

			let componentMinY = currentY;
			let componentMaxY = currentY;

			// Position nodes within component
			nodesByDepth.forEach((depthNodes, depth) => {
				depthNodes.forEach((node, index) => {
					node.x = startX + depth * depthSpacing;
					node.y = currentY + index * nodeSpacing;
					componentMaxY = Math.max(componentMaxY, node.y);
				});
				currentY = componentMaxY + nodeSpacing;
			});

			const componentHeight = componentMaxY - componentMinY + 80;

			components.push({
				id: componentName,
				name: componentName,
				x: startX + minDepth * depthSpacing - 40,
				y: componentMinY - 40,
				width: componentWidth,
				height: componentHeight,
				nodes: componentNodes,
			});

			allNodes.push(...componentNodes);
			currentY = componentMaxY + componentSpacing;
		});

		// Layout ungrouped nodes
		const ungroupedByDepth = new Map<number, GraphNode[]>();
		ungroupedNodes.forEach(node => {
			if (!ungroupedByDepth.has(node.depth)) {
				ungroupedByDepth.set(node.depth, []);
			}
			ungroupedByDepth.get(node.depth)!.push(node);
		});

		ungroupedByDepth.forEach((depthNodes, depth) => {
			depthNodes.forEach((node, index) => {
				node.x = startX + depth * depthSpacing;
				node.y = currentY + index * nodeSpacing;
			});
			if (depthNodes.length > 0) {
				currentY += (depthNodes.length - 1) * nodeSpacing + componentSpacing;
			}
		});

		allNodes.push(...ungroupedNodes);

		setGraphData({
			nodes: allNodes,
			links: Array.from(links.values()),
			components: components,
		});
	}, [updates]);

	if (graphData.nodes.length === 0) {
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

	return (
		<div className="graph-container">
			<div className="graph-content">
				<svg ref={svgRef} className="graph-svg">
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

					{/* Component Groups */}
					<g className="component-groups">
						{graphData.components.map(component => (
							<g key={`component-${component.id}`}>
								<rect
									className="component-boundary"
									x={component.x}
									y={component.y}
									width={component.width}
									height={component.height}
									fill="rgba(100, 149, 237, 0.1)"
									stroke="rgba(100, 149, 237, 0.3)"
									strokeWidth="2"
									strokeDasharray="5,5"
									rx="8"
								/>
								<text
									className="component-label"
									x={component.x + 10}
									y={component.y + 20}
									fill="#4169E1"
									fontSize="12"
									fontWeight="bold"
								>
									{component.name}
								</text>
							</g>
						))}
					</g>

					{/* Links */}
					<g className="links">
						{graphData.links.map((link, index) => {
							const sourceNode = graphData.nodes.find(
								n => n.id === link.source
							);
							const targetNode = graphData.nodes.find(
								n => n.id === link.target
							);

							if (!sourceNode || !targetNode) return null;

							return (
								<line
									key={`link-${index}`}
									className="graph-link"
									x1={sourceNode.x + 30}
									y1={sourceNode.y}
									x2={targetNode.x - 30}
									y2={targetNode.y}
								/>
							);
						})}
					</g>

					{/* Nodes */}
					<g className="nodes">
						{graphData.nodes.map(node => (
							<g key={node.id} className="graph-node-group">
								<circle
									className={`graph-node ${node.type}`}
									cx={node.x}
									cy={node.y}
									r="25"
								/>
								<text
									className="graph-text"
									x={node.x}
									y={node.y}
									textLength={
										8 * (node.name.length > 8 ? 11 : node.name.length)
									}
									lengthAdjust="spacingAndGlyphs"
								>
									{node.name.length > 8
										? node.name.slice(0, 8) + "..."
										: node.name}
								</text>
							</g>
						))}
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
				</div>
			</div>
		</div>
	);
}
