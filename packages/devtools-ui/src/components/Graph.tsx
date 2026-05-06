import { useRef, useEffect } from "preact/hooks";
import { useComputed, useSignal } from "@preact/signals";
import type { GraphData, GraphLink, GraphNode } from "../types";
import type { SignalUpdate } from "../context";
import { getContext } from "../context";

const DEFAULT_VIEWPORT_SIZE = { width: 800, height: 600 };
const FIT_PADDING = 80;
const MIN_ZOOM = 0.001;
const MAX_ZOOM = 5;

interface Point {
	x: number;
	y: number;
}

interface ViewportSize {
	width: number;
	height: number;
}

interface GraphBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

const getNodeRadius = (node: GraphNode) => {
	const baseRadius = 30;
	const charWidth = 6.5;
	const padding = 16;
	const textWidth = node.name.length * charWidth + padding;
	return Math.max(baseRadius, Math.min(textWidth / 2, 70));
};

export const calculateGraphBounds = (
	nodes: GraphNode[]
): GraphBounds | null => {
	if (nodes.length === 0) return null;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const node of nodes) {
		const radius = getNodeRadius(node) + 24;
		minX = Math.min(minX, node.x - radius);
		minY = Math.min(minY, node.y - radius);
		maxX = Math.max(maxX, node.x + radius);
		maxY = Math.max(maxY, node.y + radius);
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: Math.max(1, maxX - minX),
		height: Math.max(1, maxY - minY),
	};
};

export const calculateFitTransform = (
	bounds: GraphBounds | null,
	viewport: ViewportSize,
	padding = FIT_PADDING
) => {
	if (!bounds) return { offset: { x: 0, y: 0 }, zoom: 1 };

	const viewportWidth = Math.max(1, viewport.width);
	const viewportHeight = Math.max(1, viewport.height);
	const availableWidth = Math.max(1, viewportWidth - padding * 2);
	const availableHeight = Math.max(1, viewportHeight - padding * 2);
	const nextZoom = Math.min(
		MAX_ZOOM,
		Math.max(
			MIN_ZOOM,
			Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
		)
	);

	return {
		offset: {
			x: (viewportWidth - bounds.width * nextZoom) / 2 - bounds.minX * nextZoom,
			y:
				(viewportHeight - bounds.height * nextZoom) / 2 -
				bounds.minY * nextZoom,
		},
		zoom: nextZoom,
	};
};

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
	const viewportSize = useSignal<ViewportSize>(DEFAULT_VIEWPORT_SIZE);
	const hasUserAdjustedView = useSignal(false);
	const pendingPanOffset = useRef<Point | null>(null);
	const panAnimationFrame = useRef<number | null>(null);

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

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateViewportSize = () => {
			const rect = container.getBoundingClientRect();
			const width = Math.max(
				1,
				rect.width || container.clientWidth || DEFAULT_VIEWPORT_SIZE.width
			);
			const height = Math.max(
				1,
				rect.height || container.clientHeight || DEFAULT_VIEWPORT_SIZE.height
			);
			const current = viewportSize.value;

			if (current.width !== width || current.height !== height) {
				viewportSize.value = { width, height };
			}
		};

		updateViewportSize();

		let resizeObserver: ResizeObserver | undefined;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(updateViewportSize);
			resizeObserver.observe(container);
		}

		window.addEventListener("resize", updateViewportSize);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener("resize", updateViewportSize);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (panAnimationFrame.current !== null) {
				cancelAnimationFrame(panAnimationFrame.current);
			}
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
		const showDisposed = settingsStore.showDisposedSignals.value;

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

		// Layout nodes with proper spacing. Keep every layer within positive graph
		// coordinates so tall layers are pannable instead of being clipped above 0.
		const nodeSpacing = 120;
		const layerSpacing = 250;
		const graphPadding = 100;
		const maxLayerNodeCount = Math.max(
			1,
			...Array.from(nodesByLayer.values()).map(layerNodes => layerNodes.length)
		);
		const graphHeight =
			graphPadding * 2 + Math.max(0, maxLayerNodeCount - 1) * nodeSpacing;

		nodesByLayer.forEach((layerNodes, layer) => {
			const layerHeight = (layerNodes.length - 1) * nodeSpacing;
			const layerStartY =
				graphPadding + (graphHeight - graphPadding * 2 - layerHeight) / 2;

			layerNodes.forEach((node, index) => {
				node.x = graphPadding + layer * layerSpacing;
				node.y = layerStartY + index * nodeSpacing;
			});
		});

		return {
			nodes: Array.from(nodes.values()),
			links: allLinks,
		};
	});

	const graphBounds = useComputed(() =>
		calculateGraphBounds(graphData.value.nodes)
	);
	const nodesById = useComputed(
		() => new Map(graphData.value.nodes.map(node => [node.id, node]))
	);
	const layoutSignature = graphBounds.value
		? [
				graphData.value.nodes.length,
				graphData.value.links.length,
				Math.round(graphBounds.value.minX),
				Math.round(graphBounds.value.minY),
				Math.round(graphBounds.value.maxX),
				Math.round(graphBounds.value.maxY),
			].join(":")
		: "empty";

	const applyViewTransform = (next: { offset: Point; zoom: number }) => {
		if (Math.abs(zoom.value - next.zoom) > 0.001) {
			zoom.value = next.zoom;
		}

		if (
			Math.abs(panOffset.value.x - next.offset.x) > 0.5 ||
			Math.abs(panOffset.value.y - next.offset.y) > 0.5
		) {
			panOffset.value = next.offset;
		}
	};

	const fitView = () => {
		applyViewTransform(
			calculateFitTransform(graphBounds.value, viewportSize.value)
		);
	};

	useEffect(() => {
		if (!hasUserAdjustedView.value) {
			fitView();
		}
	}, [layoutSignature, viewportSize.value.width, viewportSize.value.height]);

	const getSvgPoint = (e: MouseEvent | WheelEvent): Point | null => {
		const svg = svgRef.current;
		if (!svg) return null;

		const ctm = svg.getScreenCTM();
		if (ctm) {
			const point = svg.createSVGPoint();
			point.x = e.clientX;
			point.y = e.clientY;
			const svgPoint = point.matrixTransform(ctm.inverse());
			return { x: svgPoint.x, y: svgPoint.y };
		}

		const rect = svg.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;

		return {
			x: ((e.clientX - rect.left) / rect.width) * viewportSize.value.width,
			y: ((e.clientY - rect.top) / rect.height) * viewportSize.value.height,
		};
	};

	const schedulePanOffset = (nextOffset: Point) => {
		pendingPanOffset.current = nextOffset;

		if (panAnimationFrame.current !== null) return;

		panAnimationFrame.current = requestAnimationFrame(() => {
			panAnimationFrame.current = null;
			if (pendingPanOffset.current) {
				panOffset.value = pendingPanOffset.current;
				pendingPanOffset.current = null;
			}
		});
	};

	const handleMouseDown = (e: MouseEvent) => {
		if (e.button !== 0) return;
		const point = getSvgPoint(e);
		if (!point) return;

		hasUserAdjustedView.value = true;
		isPanning.value = true;
		startPan.value = {
			x: point.x - panOffset.value.x,
			y: point.y - panOffset.value.y,
		};
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isPanning.value) return;
		const point = getSvgPoint(e);
		if (!point) return;

		schedulePanOffset({
			x: point.x - startPan.value.x,
			y: point.y - startPan.value.y,
		});
	};

	const handleMouseUp = () => {
		isPanning.value = false;
	};

	const handleWheel = (e: WheelEvent) => {
		e.preventDefault();

		const point = getSvgPoint(e);
		if (!point) return;

		hasUserAdjustedView.value = true;

		const normalizedDeltaY =
			e.deltaMode === WheelEvent.DOM_DELTA_LINE
				? e.deltaY * 16
				: e.deltaMode === WheelEvent.DOM_DELTA_PAGE
					? e.deltaY * viewportSize.value.height
					: e.deltaY;
		const delta = Math.exp(-normalizedDeltaY * 0.0015);
		const newZoom = Math.min(Math.max(MIN_ZOOM, zoom.value * delta), MAX_ZOOM);

		const zoomRatio = newZoom / zoom.value;
		panOffset.value = {
			x: point.x - (point.x - panOffset.value.x) * zoomRatio,
			y: point.y - (point.y - panOffset.value.y) * zoomRatio,
		};

		zoom.value = newZoom;
	};

	const resetView = () => {
		hasUserAdjustedView.value = false;
		fitView();
	};

	const toggleExportMenu = () => {
		showExportMenu.value = !showExportMenu.value;
	};

	const mermaidIdPattern = /[^a-zA-Z0-9]/g;
	const computeMermaidId = (id: string) => id.replace(mermaidIdPattern, "_");

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

	const viewBoxWidth = Math.max(1, viewportSize.value.width);
	const viewBoxHeight = Math.max(1, viewportSize.value.height);

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
					width="100%"
					height="100%"
					viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
					preserveAspectRatio="none"
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
								const sourceNode = nodesById.value.get(link.source);
								const targetNode = nodesById.value.get(link.target);

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
						title="Fit graph to viewport"
					>
						⟲ Fit View
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
