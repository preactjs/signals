import { useEffect, useRef, useState } from "preact/hooks";
import {
	Divider,
	GraphData,
	GraphLink,
	GraphNode,
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
			let type: "signal" | "computed" | "effect" = "signal";
			if (update.type === "effect") {
				type = "effect";
			} else if (update.subscribedTo) {
				type = "computed";
			}

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

					// Also ensure source node exists
					if (!nodes.has(update.subscribedTo)) {
						nodes.set(update.subscribedTo, {
							id: update.subscribedTo,
							name: update.signalName,
							type: "signal",
							x: 0,
							y: 0,
							depth: currentDepth - 1,
						});
					}
				}
			}
		});

		// Layout nodes by depth
		const nodesByDepth = new Map<number, GraphNode[]>();
		nodes.forEach(node => {
			if (!nodesByDepth.has(node.depth)) {
				nodesByDepth.set(node.depth, []);
			}
			nodesByDepth.get(node.depth)!.push(node);
		});

		// Position nodes
		const nodeSpacing = 120;
		const depthSpacing = 200;
		const startX = 100;
		const startY = 100;

		nodesByDepth.forEach((depthNodes, depth) => {
			const totalHeight = (depthNodes.length - 1) * nodeSpacing;
			const offsetY = -totalHeight / 2;

			depthNodes.forEach((node, index) => {
				node.x = startX + depth * depthSpacing;
				node.y = startY + offsetY + index * nodeSpacing;
			});
		});

		setGraphData({
			nodes: Array.from(nodes.values()),
			links: Array.from(links.values()),
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
									textLength="40"
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
