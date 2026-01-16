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
	const { updatesStore } = getContext();
	const updates = updatesStore.updates;
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const exportMenuRef = useRef<HTMLDivElement>(null);

	// Pan and zoom state using signals
	const panOffset = useSignal({ x: 0, y: 0 });
	const zoom = useSignal(1);
	const isPanning = useSignal(false);
	const startPan = useSignal({ x: 0, y: 0 });
	const showExportMenu = useSignal(false);
	const toastText = useSignal<string>();

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

	// Build graph data from updates signal using a computed
	const graphData = useComputed<GraphData>(() => {
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
							depth: currentDepth + 1,
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
		const nodeSpacing = 120;
		const depthSpacing = 250;
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
			const depthStartY = startY + maxDepth * 100 - depthHeight / 2;

			depthNodes.forEach((node, index) => {
				node.x = startX + depth * depthSpacing;
				node.y = depthStartY + index * nodeSpacing;
			});
		});

		return {
			nodes: allNodes,
			links: Array.from(links.values()),
			components: [],
		};
	});

	// Mouse event handlers for panning
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

		const delta = e.deltaY > 0 ? 0.9 : 1.1;
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
					lines.push(`  ${id}[${name}]`);
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
							markerWidth="10"
							markerHeight="7"
							refX="9"
							refY="3.5"
							orient="auto"
						>
							<polygon points="0 0, 10 3.5, 0 7" fill="#666" />
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

						<g className="nodes">
							{graphData.value.nodes.map(node => {
								const radius = node.type === "component" ? 40 : 30;
								const maxChars = node.type === "component" ? 10 : 7;
								const displayName =
									node.name.length > maxChars
										? node.name.slice(0, maxChars) + "..."
										: node.name;
								const isTextTruncated = node.name.length > maxChars;

								return (
									<g key={node.id} className="graph-node-group">
										{node.type === "component" ? (
											<rect
												className={`graph-node ${node.type}`}
												x={node.x - radius}
												y={node.y - 22}
												width={radius * 2}
												height={44}
												rx="10"
											>
												{isTextTruncated && <title>{node.name}</title>}
											</rect>
										) : (
											<circle
												className={`graph-node ${node.type}`}
												cx={node.x}
												cy={node.y}
												r={radius}
											>
												{isTextTruncated && <title>{node.name}</title>}
											</circle>
										)}
										<text
											className="graph-text"
											x={node.x}
											y={node.y + 4}
											textAnchor="middle"
											dominantBaseline="middle"
											fontSize="12"
											fontWeight="500"
										>
											{displayName}
											{isTextTruncated && <title>{node.name}</title>}
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
				</div>

				{toastText.value && (
					<div className="graph-toast">{toastText.value}</div>
				)}

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
