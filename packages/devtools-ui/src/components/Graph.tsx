import { useRef, useEffect } from "preact/hooks";
import { useComputed, useSignal } from "@preact/signals";
import type { GraphData, GraphLink, GraphNode } from "../types";
import type { SignalUpdate } from "../context";
import { getContext } from "../context";

const copyToClipboard = (text: string) => {
	const copyEl = document.createElement("textarea");
	try {
		copyEl.value = text;
		document.body.append(copyEl);
		copyEl.select();
		document.execCommand("copy");
	} finally {
		copyEl.remove();
	}
};

export function GraphVisualization() {
	const { updatesStore, settingsStore } = getContext();
	const updates = updatesStore.updates;
	const disposedSignalIds = updatesStore.disposedSignalIds;
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const exportMenuRef = useRef<HTMLDivElement>(null);

	const panOffset = useSignal({ x: 0, y: 0 });
	const zoom = useSignal(1);
	const isPanning = useSignal(false);
	const startPan = useSignal({ x: 0, y: 0 });
	const showExportMenu = useSignal(false);
	const toastText = useSignal<string>();
	const hoveredNode = useSignal<GraphNode | null>(null);
	const tooltipPos = useSignal({ x: 0, y: 0 });

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				showExportMenu.value &&
				exportMenuRef.current &&
				!exportMenuRef.current.contains(e.target as Node)
			) {
				showExportMenu.value = false;
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	// Improved topological sort with proper layering
	const computeNodeLayers = (
		nodes: Map<string, GraphNode>,
		links: GraphLink[]
	): Map<string, number> => {
		const layers = new Map<string, number>();
		const adjacency = new Map<string, Set<string>>();
		const inDegree = new Map<string, number>();

		// Initialize adjacency list and in-degrees
		nodes.forEach((_, id) => {
			adjacency.set(id, new Set());
			inDegree.set(id, 0);
		});

		// Build adjacency list and calculate in-degrees
		links.forEach(link => {
			adjacency.get(link.source)?.add(link.target);
			inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
		});

		// BFS-based layering (Kahn's algorithm with layers)
		const queue: string[] = [];

		// Start with nodes that have no dependencies (in-degree = 0)
		nodes.forEach((_, id) => {
			if (inDegree.get(id) === 0) {
				queue.push(id);
				layers.set(id, 0);
			}
		});

		while (queue.length > 0) {
			const nodeId = queue.shift()!;
			const currentLayer = layers.get(nodeId)!;

			// Process all nodes that depend on this node
			adjacency.get(nodeId)?.forEach(targetId => {
				// Update target's layer to be at least one more than current
				const targetLayer = layers.get(targetId) ?? 0;
				layers.set(targetId, Math.max(targetLayer, currentLayer + 1));

				// Decrease in-degree and add to queue if all dependencies processed
				const newInDegree = (inDegree.get(targetId) || 0) - 1;
				inDegree.set(targetId, newInDegree);

				if (newInDegree === 0) {
					queue.push(targetId);
				}
			});
		}

		return layers;
	};

	// Reduce edge crossings within layers using barycenter heuristic
	const minimizeCrossings = (
		nodesByLayer: Map<number, GraphNode[]>,
		links: GraphLink[]
	): void => {
		const layers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

		// Build adjacency maps for quick lookup
		const targets = new Map<string, string[]>();
		const sources = new Map<string, string[]>();

		links.forEach(link => {
			if (!targets.has(link.source)) targets.set(link.source, []);
			if (!sources.has(link.target)) sources.set(link.target, []);
			targets.get(link.source)!.push(link.target);
			sources.get(link.target)!.push(link.source);
		});

		// Create position maps for quick lookup
		const nodePositions = new Map<string, number>();

		// Multiple passes to reduce crossings
		for (let pass = 0; pass < 4; pass++) {
			// Forward pass: order based on predecessors
			for (let i = 0; i < layers.length; i++) {
				const layer = layers[i];
				const nodes = nodesByLayer.get(layer)!;

				// Update position map for current layer
				nodes.forEach((node, idx) => {
					nodePositions.set(node.id, idx);
				});

				if (i === 0) continue; // Skip first layer

				// Calculate barycenter for each node based on predecessors
				const barycenters = nodes.map(node => {
					const preds = sources.get(node.id) || [];
					if (preds.length === 0) return 0;

					const sum = preds.reduce((acc, predId) => {
						return acc + (nodePositions.get(predId) ?? 0);
					}, 0);
					return sum / preds.length;
				});

				// Sort nodes by barycenter
				const sorted = nodes
					.map((node, idx) => ({ node, barycenter: barycenters[idx] }))
					.sort((a, b) => a.barycenter - b.barycenter)
					.map(item => item.node);

				nodesByLayer.set(layer, sorted);
			}

			// Backward pass: order based on successors
			for (let i = layers.length - 1; i >= 0; i--) {
				const layer = layers[i];
				const nodes = nodesByLayer.get(layer)!;

				// Update position map for current layer
				nodes.forEach((node, idx) => {
					nodePositions.set(node.id, idx);
				});

				if (i === layers.length - 1) continue; // Skip last layer

				// Calculate barycenter for each node based on successors
				const barycenters = nodes.map(node => {
					const succs = targets.get(node.id) || [];
					if (succs.length === 0) return 0;

					const sum = succs.reduce((acc, succId) => {
						return acc + (nodePositions.get(succId) ?? 0);
					}, 0);
					return sum / succs.length;
				});

				// Sort nodes by barycenter
				const sorted = nodes
					.map((node, idx) => ({ node, barycenter: barycenters[idx] }))
					.sort((a, b) => a.barycenter - b.barycenter)
					.map(item => item.node);

				nodesByLayer.set(layer, sorted);
			}
		}
	};

	const graphData = useComputed<GraphData>(() => {
		const rawUpdates = updates.value;
		const disposed = disposedSignalIds.value;
		const showDisposed = settingsStore.showDisposedSignals;

		if (!rawUpdates || rawUpdates.length === 0) return { nodes: [], links: [] };

		const nodes = new Map<string, GraphNode>();
		const links = new Map<string, GraphLink>();

		const signalUpdates = rawUpdates.filter(
			update => update.type !== "divider"
		) as SignalUpdate[];

		for (const update of signalUpdates) {
			if (!update.signalId) continue;
			if (!showDisposed && disposed.has(update.signalId)) continue;

			const type: "signal" | "computed" | "effect" | "component" =
				update.signalType;

			if (!nodes.has(update.signalId)) {
				nodes.set(update.signalId, {
					id: update.signalId,
					name: update.signalName,
					type,
					x: 0,
					y: 0,
					depth: 0, // Will be recalculated
				});
			}

			if (update.allDependencies && update.allDependencies.length > 0) {
				for (const dep of update.allDependencies) {
					const sourceDisposed = !showDisposed && disposed.has(dep.id);
					if (sourceDisposed) continue;

					if (!nodes.has(dep.id)) {
						nodes.set(dep.id, {
							id: dep.id,
							name: dep.name,
							type: dep.type,
							x: 0,
							y: 0,
							depth: 0,
						});
					}

					const linkKey = `${dep.id}->${update.signalId}`;
					if (!links.has(linkKey)) {
						links.set(linkKey, {
							source: dep.id,
							target: update.signalId,
						});
					}
				}
			} else if (update.subscribedTo) {
				const sourceDisposed =
					!showDisposed && disposed.has(update.subscribedTo);
				if (sourceDisposed) continue;

				const linkKey = `${update.subscribedTo}->${update.signalId}`;
				if (!links.has(linkKey)) {
					links.set(linkKey, {
						source: update.subscribedTo,
						target: update.signalId,
					});
				}
			}
		}

		const allLinks = Array.from(links.values());

		// Compute proper layers using topological sort
		const nodeLayers = computeNodeLayers(nodes, allLinks);

		// Update node depths based on computed layers
		nodes.forEach((node, id) => {
			node.depth = nodeLayers.get(id) ?? 0;
		});

		// Group nodes by layer
		const nodesByLayer = new Map<number, GraphNode[]>();
		nodes.forEach(node => {
			if (!nodesByLayer.has(node.depth)) {
				nodesByLayer.set(node.depth, []);
			}
			nodesByLayer.get(node.depth)!.push(node);
		});

		// Minimize edge crossings
		minimizeCrossings(nodesByLayer, allLinks);

		// Layout nodes with proper spacing
		const nodeSpacing = 120;
		const layerSpacing = 250;
		const startX = 100;
		const startY = 80;

		nodesByLayer.forEach((layerNodes, layer) => {
			const layerHeight = (layerNodes.length - 1) * nodeSpacing;
			const layerStartY = startY - layerHeight / 2;

			layerNodes.forEach((node, index) => {
				node.x = startX + layer * layerSpacing;
				node.y = layerStartY + index * nodeSpacing + nodesByLayer.size * 50;
			});
		});

		return {
			nodes: Array.from(nodes.values()),
			links: allLinks,
		};
	});

	const handleMouseDown = (e: MouseEvent) => {
		if (e.button !== 0) return;
		isPanning.value = true;
		startPan.value = {
			x: e.clientX - panOffset.value.x,
			y: e.clientY - panOffset.value.y,
		};
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isPanning.value) return;
		panOffset.value = {
			x: e.clientX - startPan.value.x,
			y: e.clientY - startPan.value.y,
		};
	};

	const handleMouseUp = () => {
		isPanning.value = false;
	};

	const handleWheel = (e: WheelEvent) => {
		e.preventDefault();

		const container = containerRef.current;
		if (!container) return;

		const rect = container.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		const delta = e.deltaY > 0 ? 0.96 : 1.04;
		const newZoom = Math.min(Math.max(0.1, zoom.value * delta), 5);

		const zoomRatio = newZoom / zoom.value;
		panOffset.value = {
			x: mouseX - (mouseX - panOffset.value.x) * zoomRatio,
			y: mouseY - (mouseY - panOffset.value.y) * zoomRatio,
		};

		zoom.value = newZoom;
	};

	const resetView = () => {
		panOffset.value = { x: 0, y: 0 };
		zoom.value = 1;
	};

	const toggleExportMenu = () => {
		showExportMenu.value = !showExportMenu.value;
	};

	const mermaidIdPattern = /[^a-zA-Z0-9]/g;
	const computeMermaidId = (id: string) => id.replace(mermaidIdPattern, "_");

	const getNodeRadius = (node: GraphNode) => {
		const baseRadius = 30;
		const charWidth = 6.5;
		const padding = 16;
		const textWidth = node.name.length * charWidth + padding;
		return Math.max(baseRadius, Math.min(textWidth / 2, 70));
	};

	const handleNodeMouseEnter = (node: GraphNode, e: MouseEvent) => {
		hoveredNode.value = node;
		const container = containerRef.current;
		if (container) {
			const rect = container.getBoundingClientRect();
			tooltipPos.value = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			};
		}
	};

	const handleNodeMouseMove = (e: MouseEvent) => {
		const container = containerRef.current;
		if (container && hoveredNode.value) {
			const rect = container.getBoundingClientRect();
			tooltipPos.value = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			};
		}
	};

	const handleNodeMouseLeave = () => {
		hoveredNode.value = null;
	};

	const showToast = (text: string) => {
		toastText.value = text;
		setTimeout(() => {
			toastText.value = undefined;
		}, 2000);
	};

	const handleExportMermaid = async () => {
		showExportMenu.value = false;

		const lines: string[] = ["graph LR"];

		graphData.value.nodes.forEach(node => {
			const id = computeMermaidId(node.id);
			const name = node.name;

			switch (node.type) {
				case "signal":
					lines.push(`  ${id}((${name}))`);
					break;
				case "computed":
					lines.push(`  ${id}(${name})`);
					break;
				case "effect":
					lines.push(`  ${id}([${name}])`);
					break;
				case "component":
					lines.push(`  ${id}{{${name}}}`);
					break;
			}
		});

		for (const link of graphData.value.links) {
			const sourceId = computeMermaidId(link.source);
			const targetId = computeMermaidId(link.target);
			lines.push(`  ${sourceId} --> ${targetId}`);
		}

		copyToClipboard(lines.join("\n"));
		showToast("Copied to clipboard!");
	};

	const handleExportJSON = async () => {
		showExportMenu.value = false;
		const value = JSON.stringify(graphData.value, null, 2);
		copyToClipboard(value);
		showToast("Copied to clipboard!");
	};

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

	const svgWidth = Math.max(800, ...graphData.value.nodes.map(n => n.x + 100));
	const svgHeight = Math.max(600, ...graphData.value.nodes.map(n => n.y + 100));

	return (
		<div className="graph-container">
			<div
				ref={containerRef}
				className="graph-content"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onWheel={handleWheel}
				style={{ cursor: isPanning.value ? "grabbing" : "grab" }}
			>
				<svg
					ref={svgRef}
					className="graph-svg"
					width={svgWidth}
					height={svgHeight}
					viewBox={`0 0 ${svgWidth} ${svgHeight}`}
				>
					<defs>
						<marker
							id="arrowhead"
							markerWidth="8"
							markerHeight="6"
							refX="7"
							refY="3"
							orient="auto"
						>
							<polygon points="0 0, 8 3, 0 6" className="graph-arrowhead" />
						</marker>
					</defs>

					<g
						transform={`translate(${panOffset.value.x}, ${panOffset.value.y}) scale(${zoom.value})`}
					>
						<g className="links">
							{graphData.value.links.map((link, index) => {
								const sourceNode = graphData.value.nodes.find(
									n => n.id === link.source
								);
								const targetNode = graphData.value.nodes.find(
									n => n.id === link.target
								);

								if (!sourceNode || !targetNode) return null;

								const sourceRadius = getNodeRadius(sourceNode);
								const targetRadius = getNodeRadius(targetNode);
								const sourceX = sourceNode.x + sourceRadius;
								const sourceY = sourceNode.y;
								const targetX = targetNode.x - targetRadius - 8;
								const targetY = targetNode.y;

								const midX = sourceX + (targetX - sourceX) * 0.5;
								const pathData = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

								return (
									<path
										key={`link-${index}`}
										className="graph-link"
										d={pathData}
										fill="none"
										markerEnd="url(#arrowhead)"
									/>
								);
							})}
						</g>

						<g className="nodes">
							{graphData.value.nodes.map(node => {
								const radius = getNodeRadius(node);
								const maxChars = Math.floor((radius * 2 - 16) / 6.5);
								const displayName =
									node.name.length > maxChars
										? node.name.slice(0, maxChars - 1) + "…"
										: node.name;
								const isHovered = hoveredNode.value?.id === node.id;

								return (
									<g
										key={node.id}
										className={`graph-node-group ${isHovered ? "hovered" : ""}`}
										onMouseEnter={(e: MouseEvent) =>
											handleNodeMouseEnter(node, e)
										}
										onMouseMove={handleNodeMouseMove}
										onMouseLeave={handleNodeMouseLeave}
									>
										<circle
											className={`graph-node ${node.type}`}
											cx={node.x}
											cy={node.y}
											r={radius}
										/>
										<text
											className="graph-text"
											x={node.x}
											y={node.y}
											textAnchor="middle"
											dominantBaseline="central"
										>
											{displayName}
										</text>
									</g>
								);
							})}
						</g>
					</g>
				</svg>

				<div className="graph-controls">
					<button
						className="graph-reset-button"
						onClick={resetView}
						title="Reset view"
					>
						⟲ Reset View
					</button>

					<div ref={exportMenuRef} className="graph-export-container">
						<button
							className="graph-export-button"
							onClick={toggleExportMenu}
							title="Export graph"
						>
							↓ Export
						</button>
						{showExportMenu.value && (
							<div className="graph-export-menu">
								<button
									className="graph-export-menu-item"
									onClick={handleExportMermaid}
								>
									Mermaid
								</button>
								<button
									className="graph-export-menu-item"
									onClick={handleExportJSON}
								>
									JSON
								</button>
							</div>
						)}
					</div>

					<div className="graph-zoom-indicator" title="Zoom level">
						{Math.round(zoom.value * 100)}%
					</div>
				</div>

				{toastText.value && (
					<div className="graph-toast">{toastText.value}</div>
				)}

				{hoveredNode.value && (
					<div
						className="graph-tooltip"
						style={{
							left: tooltipPos.value.x + 12,
							top: tooltipPos.value.y - 8,
						}}
					>
						<div className="tooltip-header">
							<span className={`tooltip-type ${hoveredNode.value.type}`}>
								{hoveredNode.value.type}
							</span>
						</div>
						<div className="tooltip-name">{hoveredNode.value.name}</div>
						<div className="tooltip-id">ID: {hoveredNode.value.id}</div>
					</div>
				)}

				<div className="graph-legend">
					<div className="legend-item">
						<div className="legend-color signal"></div>
						<span>Signal</span>
					</div>
					<div className="legend-item">
						<div className="legend-color computed"></div>
						<span>Computed</span>
					</div>
					<div className="legend-item">
						<div className="legend-color effect"></div>
						<span>Effect</span>
					</div>
					<div className="legend-item">
						<div className="legend-color component"></div>
						<span>Component</span>
					</div>
				</div>
			</div>
		</div>
	);
}
