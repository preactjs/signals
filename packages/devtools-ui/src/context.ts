import { signal, computed, effect } from "@preact/signals";
import type {
	DevToolsAdapter,
	ConnectionStatus,
	ConnectionStatusType,
	Settings,
	SignalDisposed,
	DependencyInfo,
} from "@preact/signals-devtools-adapter";

export type ThemeMode = "auto" | "light" | "dark";

export interface DevToolsContext {
	adapter: DevToolsAdapter;
	connectionStore: ReturnType<typeof createConnectionStore>;
	updatesStore: ReturnType<typeof createUpdatesStore>;
	settingsStore: ReturnType<typeof createSettingsStore>;
	themeStore: ReturnType<typeof createThemeStore>;
}

let currentContext: DevToolsContext | null = null;

export function getContext(): DevToolsContext {
	if (!currentContext) {
		throw new Error(
			"DevTools context not initialized. Call initDevTools() first."
		);
	}
	return currentContext;
}

export function createConnectionStore(adapter: DevToolsAdapter) {
	const status = signal<ConnectionStatusType>("connecting");
	const message = signal<string>("Connecting...");
	const isConnected = signal(false);

	// Listen to adapter events
	adapter.on(
		"connectionStatusChanged",
		(connectionStatus: ConnectionStatus) => {
			status.value = connectionStatus.status;
			message.value = connectionStatus.message;
		}
	);

	adapter.on("signalsAvailable", (available: boolean) => {
		isConnected.value = available;
	});

	const refreshConnection = () => {
		status.value = "connecting";
		message.value = "Connecting...";
		adapter.requestState();
	};

	return {
		get status() {
			return status.value;
		},
		get message() {
			return message.value;
		},
		get isConnected() {
			return isConnected.value;
		},
		refreshConnection,
	};
}

export interface SignalUpdate {
	type: "update" | "effect" | "component";
	signalType: "signal" | "computed" | "effect" | "component";
	signalName: string;
	signalId?: string;
	prevValue?: any;
	newValue?: any;
	timestamp?: number;
	receivedAt: number;
	depth?: number;
	subscribedTo?: string;
	/** All dependencies this computed/effect currently depends on (with rich info) */
	allDependencies?: DependencyInfo[];
}

export type Divider = { type: "divider" };

export interface UpdateTreeNodeBase {
	id: string;
	update: SignalUpdate;
	children: UpdateTreeNode[];
	depth: number;
	hasChildren: boolean;
}

export interface UpdateTreeNodeSingle extends UpdateTreeNodeBase {
	type: "single";
}

export interface UpdateTreeNodeGroup extends UpdateTreeNodeBase {
	type: "group";
	count: number;
	firstUpdate: SignalUpdate;
	firstChildren: UpdateTreeNode[];
}

export type UpdateTreeNode = UpdateTreeNodeGroup | UpdateTreeNodeSingle;

const nodesAreEqual = (a: UpdateTreeNode, b: UpdateTreeNode): boolean => {
	return (
		a.update.signalId === b.update.signalId &&
		a.children.length === b.children.length &&
		a.children.every((child, index) => nodesAreEqual(child, b.children[index]))
	);
};

const collapseTree = (nodes: UpdateTreeNodeSingle[]): UpdateTreeNode[] => {
	const tree: UpdateTreeNode[] = [];
	let lastNode: UpdateTreeNode | undefined;

	for (const node of nodes) {
		if (lastNode && nodesAreEqual(lastNode, node)) {
			if (lastNode.type !== "group") {
				tree.pop();
				lastNode = {
					...lastNode,
					type: "group",
					count: 2,
					firstUpdate: node.update,
					firstChildren: node.children,
				};
				tree.push(lastNode);
			} else {
				lastNode.count++;
				lastNode.firstUpdate = node.update;
				lastNode.firstChildren = node.children;
			}
			continue;
		}
		tree.push(node);
		lastNode = node;
	}

	return tree;
};

export function createUpdatesStore(
	adapter: DevToolsAdapter,
	settingsStore: ReturnType<typeof createSettingsStore>
) {
	const updates = signal<(SignalUpdate | Divider)[]>([]);
	const isPaused = signal<boolean>(false);
	const disposedSignalIds = signal<Set<string>>(new Set());

	const addUpdate = (
		update: SignalUpdate | Divider | Array<SignalUpdate | Divider>
	) => {
		if (Array.isArray(update)) {
			update.forEach(item => {
				if (item.type !== "divider") item.receivedAt = Date.now();
			});
		} else if (update.type === "update") {
			update.receivedAt = Date.now();
		}
		updates.value = [
			...updates.value,
			...(Array.isArray(update) ? update : [update]),
		];
	};

	const addDisposal = (disposal: SignalDisposed | SignalDisposed[]) => {
		const disposals = Array.isArray(disposal) ? disposal : [disposal];
		const newDisposed = new Set(disposedSignalIds.value);
		for (const d of disposals) {
			if (d.signalId) {
				newDisposed.add(d.signalId);
			}
		}
		disposedSignalIds.value = newDisposed;
	};

	const hasUpdates = computed(() => updates.value.length > 0);

	const signalCounts = computed(() => {
		const counts = new Map<string, number>();
		updates.value.forEach(update => {
			if (update.type === "divider") return;
			const signalName = update.signalName || "Unknown";
			counts.set(signalName, (counts.get(signalName) || 0) + 1);
		});
		return counts;
	});

	const updateTree = computed(() => {
		const buildTree = (
			updates: (SignalUpdate | Divider)[]
		): UpdateTreeNodeSingle[] => {
			const tree: UpdateTreeNodeSingle[] = [];
			const stack: UpdateTreeNodeSingle[] = [];

			const recentUpdates = updates.slice(-100).reverse();

			for (let i = 0; i < recentUpdates.length; i++) {
				const item = recentUpdates[i];

				if (item.type === "divider") {
					continue;
				}

				const update = item as SignalUpdate;
				const depth = update.depth || 0;

				const nodeId = `${update.signalName}-${update.receivedAt}-${i}`;

				const node: UpdateTreeNodeSingle = {
					type: "single",
					id: nodeId,
					update,
					children: [],
					depth,
					hasChildren: false,
				};

				while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
					stack.pop();
				}

				if (stack.length === 0) {
					tree.push(node);
				} else {
					const parent = stack[stack.length - 1];
					parent.children.push(node);
					parent.hasChildren = true;
				}

				stack.push(node);
			}

			return tree;
		};

		return buildTree(updates.value);
	});

	const clearUpdates = () => {
		updates.value = [];
		disposedSignalIds.value = new Set();
	};

	// Listen to adapter events
	adapter.on("signalUpdate", (signalUpdates: SignalUpdate[]) => {
		if (isPaused.value) return;

		const updatesArray: Array<SignalUpdate | Divider> = [
			...signalUpdates,
		].reverse();
		updatesArray.push({ type: "divider" });

		addUpdate(updatesArray);
	});

	// Listen to disposal events
	adapter.on("signalDisposed", (disposals: SignalDisposed[]) => {
		if (isPaused.value) return;
		addDisposal(disposals);
	});

	const collapsedUpdateTree = computed(() => {
		const updateTreeValue = updateTree.value;
		if (settingsStore.settings.grouped) {
			return collapseTree(updateTreeValue);
		}
		return updateTreeValue;
	});

	return {
		updates,
		updateTree,
		collapsedUpdateTree,
		totalUpdates: computed(() => Object.keys(updateTree.value).length),
		signalCounts,
		disposedSignalIds,
		addUpdate,
		clearUpdates,
		hasUpdates,
		isPaused,
	};
}

export function createSettingsStore(adapter: DevToolsAdapter) {
	const settings = signal<Settings>({
		enabled: true,
		grouped: true,
		consoleLogging: true,
		maxUpdatesPerSecond: 60,
		filterPatterns: [],
	});

	const showDisposedSignals = signal<boolean>(false);

	const applySettings = (newSettings: Settings) => {
		settings.value = newSettings;
		adapter.sendConfig(newSettings);
	};

	const toggleShowDisposedSignals = () => {
		showDisposedSignals.value = !showDisposedSignals.value;
	};

	// Listen to adapter events
	adapter.on("configReceived", (config: { settings?: Settings }) => {
		if (config.settings) {
			settings.value = config.settings;
		}
	});

	return {
		get settings() {
			return settings.value;
		},
		get showDisposedSignals() {
			return showDisposedSignals.value;
		},
		set settings(newSettings: Settings) {
			settings.value = newSettings;
		},
		applySettings,
		toggleShowDisposedSignals,
	};
}

const THEME_STORAGE_KEY = "signals-devtools-theme";

export function createThemeStore() {
	const stored = (() => {
		try {
			const val = localStorage.getItem(THEME_STORAGE_KEY);
			if (val === "light" || val === "dark" || val === "auto") return val;
		} catch {
			// localStorage unavailable
		}
		return "auto" as ThemeMode;
	})();

	const theme = signal<ThemeMode>(stored);

	const mediaQuery =
		typeof window !== "undefined"
			? window.matchMedia("(prefers-color-scheme: dark)")
			: null;
	const systemIsDark = signal(mediaQuery?.matches ?? false);

	if (mediaQuery) {
		const handler = (e: MediaQueryListEvent) => {
			systemIsDark.value = e.matches;
		};
		mediaQuery.addEventListener("change", handler);
	}

	const resolvedTheme = computed<"light" | "dark">(() =>
		theme.value === "auto"
			? systemIsDark.value
				? "dark"
				: "light"
			: theme.value
	);

	// Apply data-theme attribute to the devtools container
	effect(() => {
		const resolved = resolvedTheme.value;
		const el = document.querySelector(".signals-devtools");
		if (el instanceof HTMLElement) {
			el.dataset.theme = resolved;
		}
	});

	const toggleTheme = () => {
		const order: ThemeMode[] = ["auto", "light", "dark"];
		const idx = order.indexOf(theme.value);
		theme.value = order[(idx + 1) % order.length];
		try {
			localStorage.setItem(THEME_STORAGE_KEY, theme.value);
		} catch {
			// localStorage unavailable
		}
	};

	return {
		get theme() {
			return theme.value;
		},
		get resolvedTheme() {
			return resolvedTheme.value;
		},
		toggleTheme,
	};
}

export function initDevTools(adapter: DevToolsAdapter): DevToolsContext {
	const settingsStore = createSettingsStore(adapter);
	const updatesStore = createUpdatesStore(adapter, settingsStore);
	const connectionStore = createConnectionStore(adapter);
	const themeStore = createThemeStore();

	currentContext = {
		adapter,
		connectionStore,
		updatesStore,
		settingsStore,
		themeStore,
	};

	return currentContext;
}

export function destroyDevTools(): void {
	if (currentContext) {
		currentContext.adapter.disconnect();
		currentContext = null;
	}
}
