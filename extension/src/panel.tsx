import { render, h, Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";

// Types
interface SignalUpdate {
	type: "update" | "effect";
	signalName: string;
	signalId?: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
}

interface Settings {
	enabled: boolean;
	grouped: boolean;
	maxUpdatesPerSecond: number;
	filterPatterns: string[];
}

interface ConnectionStatus {
	status: "connected" | "disconnected" | "connecting" | "warning";
	message: string;
}

interface GraphNode {
	id: string;
	name: string;
	type: "signal" | "computed" | "effect";
	x: number;
	y: number;
	depth: number;
}

interface GraphLink {
	source: string;
	target: string;
}

interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

// Header Component
function Header({
	connectionStatus,
	onClear,
	onTogglePause,
	onToggleSettings,
	isPaused,
}: {
	connectionStatus: ConnectionStatus;
	onClear: () => void;
	onTogglePause: () => void;
	onToggleSettings: () => void;
	isPaused: boolean;
}) {
	return (
		<header className="header">
			<div className="header-title">
				<h1>Preact Signals</h1>
				<div className={`connection-status ${connectionStatus.status}`}>
					<span
						className={`status-indicator ${connectionStatus.status}`}
					></span>
					<span className="status-text">{connectionStatus.message}</span>
				</div>
			</div>
			<div className="header-controls">
				<button onClick={onClear} className="btn btn-secondary">
					Clear
				</button>
				<button
					onClick={onTogglePause}
					className={`btn btn-secondary ${isPaused ? "active" : ""}`}
				>
					{isPaused ? "Resume" : "Pause"}
				</button>
				<button onClick={onToggleSettings} className="btn btn-secondary">
					Settings
				</button>
			</div>
		</header>
	);
}

// Settings Panel Component
function SettingsPanel({
	isVisible,
	settings,
	onApply,
	onCancel,
}: {
	isVisible: boolean;
	settings: Settings;
	onApply: (settings: Settings) => void;
	onCancel: () => void;
}) {
	const [localSettings, setLocalSettings] = useState<Settings>(settings);

	useEffect(() => {
		setLocalSettings(settings);
	}, [settings]);

	const handleApply = () => {
		onApply(localSettings);
	};

	if (!isVisible) return null;

	return (
		<div className="settings-panel">
			<div className="settings-content">
				<h3>Debug Configuration</h3>

				<div className="setting-group">
					<label>
						<input
							type="checkbox"
							checked={localSettings.enabled}
							onChange={e =>
								setLocalSettings({
									...localSettings,
									enabled: (e.target as HTMLInputElement).checked,
								})
							}
						/>
						Enable debug updates
					</label>
				</div>

				<div className="setting-group">
					<label>
						<input
							type="checkbox"
							checked={localSettings.grouped}
							onChange={e =>
								setLocalSettings({
									...localSettings,
									grouped: (e.target as HTMLInputElement).checked,
								})
							}
						/>
						Group related updates
					</label>
				</div>

				<div className="setting-group">
					<label htmlFor="maxUpdatesInput">Max updates per second:</label>
					<input
						type="number"
						id="maxUpdatesInput"
						value={localSettings.maxUpdatesPerSecond}
						min="1"
						max="1000"
						onChange={e =>
							setLocalSettings({
								...localSettings,
								maxUpdatesPerSecond:
									parseInt((e.target as HTMLInputElement).value) || 60,
							})
						}
					/>
				</div>

				<div className="setting-group">
					<label htmlFor="filterPatternsInput">
						Filter patterns (one per line):
					</label>
					<textarea
						id="filterPatternsInput"
						placeholder="user.*&#10;.*State$&#10;global"
						value={localSettings.filterPatterns.join("\n")}
						onChange={e =>
							setLocalSettings({
								...localSettings,
								filterPatterns: (e.target as HTMLTextAreaElement).value
									.split("\n")
									.map(pattern => pattern.trim())
									.filter(pattern => pattern.length > 0),
							})
						}
					/>
				</div>

				<div className="settings-actions">
					<button onClick={handleApply} className="btn btn-primary">
						Apply
					</button>
					<button onClick={onCancel} className="btn btn-secondary">
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

// Empty State Component
function EmptyState({ onRefresh }: { onRefresh: () => void }) {
	return (
		<div className="empty-state">
			<div className="empty-state-content">
				<h2>No Signals Detected</h2>
				<p>
					Make sure your application is using @preact/signals-debug package.
				</p>
				<div className="empty-state-actions">
					<button onClick={onRefresh} className="btn btn-primary">
						Refresh Detection
					</button>
				</div>
			</div>
		</div>
	);
}

// Update Item Component
function UpdateItem({ update }: { update: SignalUpdate }) {
	const time = new Date(
		update.timestamp || update.receivedAt
	).toLocaleTimeString();
	const depth = "  ".repeat(update.depth || 0);

	const formatValue = (value: any): string => {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return `"${value}"`;
		if (typeof value === "function") return "function()";
		if (typeof value === "object") {
			try {
				return JSON.stringify(value, null, 0);
			} catch {
				return "[Object]";
			}
		}
		return String(value);
	};

	if (update.type === "effect") {
		return (
			<div
				style={{ marginLeft: `${(update.depth || 0) * 4}px` }}
				className={`update-item ${update.type}`}
			>
				<div className="update-header">
					<span className="signal-name">
						{depth}↪️ {update.signalName}
					</span>
					<span className="update-time">{time}</span>
				</div>
			</div>
		);
	}

	const prevValue = formatValue(update.prevValue);
	const newValue = formatValue(update.newValue);

	console.log(update);

	return (
		<div
			style={{ marginLeft: `${(update.depth || 0) * 4}px` }}
			className={`update-item ${update.type}`}
		>
			<div className="update-header">
				<span className="signal-name">
					{depth}
					{update.depth === 0 ? "🎯" : "↪️"} {update.signalName}
				</span>
				<span className="update-time">{time}</span>
			</div>
			<div className="value-change">
				<span className="value-prev">{prevValue}</span>
				<span className="value-arrow">→</span>
				<span className="value-new">{newValue}</span>
			</div>
		</div>
	);
}

// Updates Container Component
function UpdatesContainer({
	updates,
	signalCounts,
}: {
	updates: (SignalUpdate | Divider)[];
	signalCounts: Map<string, number>;
}) {
	const updatesListRef = useRef<HTMLDivElement>(null);
	const recentUpdates = updates.slice(-50).reverse();

	useEffect(() => {
		if (updatesListRef.current) {
			updatesListRef.current.scrollTop = 0;
		}
	}, [updates]);

	return (
		<div className="updates-container">
			<div className="updates-header">
				<div className="updates-stats">
					<span>
						Updates:{" "}
						<strong>{updates.filter(x => x.type !== "divider").length}</strong>
					</span>
					<span>
						Signals: <strong>{signalCounts.size}</strong>
					</span>
				</div>
			</div>

			<div className="updates-list" ref={updatesListRef}>
				{recentUpdates.map((update, index) =>
					update.type === "divider" ? (
						index === recentUpdates.length - 1 ? null : (
							<div key={`${update.type}-${index}`} className="divider" />
						)
					) : (
						<div key={`${update.receivedAt}-${index}`}>
							<UpdateItem update={update} />
						</div>
					)
				)}
			</div>
		</div>
	);
}

type Divider = { type: "divider" };

// Graph Visualization Component
function GraphVisualization({
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
							name: `Signal_${update.subscribedTo.slice(-4)}`,
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

// Main Panel Component
function SignalsDevToolsPanel() {
	const [updates, setUpdates] = useState<(SignalUpdate | Divider)[]>([]);
	const [signalCounts, setSignalCounts] = useState<Map<string, number>>(
		new Map()
	);
	const [isPaused, setIsPaused] = useState(false);
	const [activeTab, setActiveTab] = useState<"updates" | "graph">("updates");
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
		status: "connecting",
		message: "Connecting...",
	});
	const [showSettings, setShowSettings] = useState(false);
	const [settings, setSettings] = useState<Settings>({
		enabled: true,
		grouped: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});
	const [showEmptyState, setShowEmptyState] = useState(true);
	const [isBackgroundConnected, setIsBackgroundConnected] = useState(false);
	const [isContentScriptConnected, setIsContentScriptConnected] =
		useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const sendMessage = (message: any) => {
		window.postMessage(message, "*");
	};

	const updateConnectionStatus = () => {
		let status: ConnectionStatus["status"], message: string;

		if (!isBackgroundConnected) {
			status = "disconnected";
			message = "Disconnected from background";
		} else if (!isContentScriptConnected) {
			status = "connecting";
			message = "Connecting to page...";
		} else if (!isConnected) {
			status = "warning";
			message = "No signals detected";
		} else {
			status = "connected";
			message = "Connected";
		}

		setConnectionStatus({ status, message });
	};

	const handleSignalsUpdate = (
		signalUpdates: SignalUpdate | SignalUpdate[]
	) => {
		if (isPaused) return;

		const updatesArray: Array<SignalUpdate | Divider> = Array.isArray(
			signalUpdates
		)
			? signalUpdates
			: [signalUpdates];

		updatesArray.reverse();
		updatesArray.push({ type: "divider" });
		setUpdates(prev => {
			const newUpdates = [...prev];
			updatesArray.forEach(update => {
				newUpdates.push({
					...update,
					// @ts-expect-error
					receivedAt: Date.now(),
				});
			});
			return newUpdates;
		});

		setSignalCounts(prev => {
			const newCounts = new Map(prev);
			updatesArray.forEach(update => {
				if (update.type === "divider") return;
				const signalName = update.signalName || "Unknown";
				newCounts.set(signalName, (newCounts.get(signalName) || 0) + 1);
			});
			return newCounts;
		});

		setShowEmptyState(false);
	};

	const handleSignalsAvailability = (available: boolean) => {
		setIsConnected(available);
		setShowEmptyState(!available);
	};

	const clearUpdates = () => {
		setUpdates([]);
		setSignalCounts(new Map());
	};

	const togglePause = () => {
		setIsPaused(!isPaused);
	};

	const toggleSettings = () => {
		setShowSettings(!showSettings);
	};

	const applySettings = (newSettings: Settings) => {
		setSettings(newSettings);
		sendMessage({
			type: "CONFIGURE_DEBUG",
			payload: newSettings,
		});
		setShowSettings(false);
	};

	const refreshDetection = () => {
		setConnectionStatus({ status: "connecting", message: "Refreshing..." });
		sendMessage({ type: "REQUEST_STATE" });
	};

	useEffect(() => {
		updateConnectionStatus();
	}, [isBackgroundConnected, isContentScriptConnected, isConnected]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			// Only accept messages from the same origin (devtools context)
			if (event.origin !== window.location.origin) {
				return;
			}

			const { type, payload } = event.data;

			console.log("Received message from background:", type, payload);

			switch (type) {
				case "SIGNALS_UPDATE":
					handleSignalsUpdate(payload.updates);
					break;

				case "SIGNALS_AVAILABILITY":
					handleSignalsAvailability(payload.available);
					break;

				case "SIGNALS_CONFIG":
					setSettings(prev => ({ ...prev, ...payload }));
					break;

				case "CONNECTION_LOST":
					setIsBackgroundConnected(false);
					setIsContentScriptConnected(false);
					break;

				case "DEVTOOLS_READY":
					setIsBackgroundConnected(true);
					setTimeout(() => {
						refreshDetection();
					}, 500);
					break;

				case "BACKGROUND_READY":
					setIsBackgroundConnected(true);
					setIsContentScriptConnected(payload.contentScriptConnected);
					break;

				case "CONTENT_SCRIPT_DISCONNECTED":
					setIsContentScriptConnected(false);
					break;

				default:
					console.log("Unhandled message type:", type);
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [isPaused]);

	return (
		<div id="app">
			<Header
				connectionStatus={connectionStatus}
				onClear={clearUpdates}
				onTogglePause={togglePause}
				onToggleSettings={toggleSettings}
				isPaused={isPaused}
			/>

			<SettingsPanel
				isVisible={showSettings}
				settings={settings}
				onApply={applySettings}
				onCancel={() => setShowSettings(false)}
			/>

			<main className="main-content">
				{/* Tabs */}
				<div className="tabs">
					<button
						className={`tab ${activeTab === "updates" ? "active" : ""}`}
						onClick={() => setActiveTab("updates")}
					>
						Updates
					</button>
					<button
						className={`tab ${activeTab === "graph" ? "active" : ""}`}
						onClick={() => setActiveTab("graph")}
					>
						Dependency Graph
					</button>
				</div>

				{/* Tab Content */}
				<div className="tab-content">
					{showEmptyState ? (
						<EmptyState onRefresh={refreshDetection} />
					) : (
						<>
							{activeTab === "updates" && (
								<UpdatesContainer
									updates={updates}
									signalCounts={signalCounts}
								/>
							)}
							{activeTab === "graph" && (
								<GraphVisualization updates={updates} />
							)}
						</>
					)}
				</div>
			</main>
		</div>
	);
}

// Initialize the panel when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	const container = document.getElementById("app");
	if (container) {
		// Clear existing content since we're taking over with Preact
		container.innerHTML = "";
		render(<SignalsDevToolsPanel />, container);
	}
});
