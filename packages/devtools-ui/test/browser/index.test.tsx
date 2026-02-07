import { createElement } from "preact";
import { render } from "preact";
import { act } from "preact/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	DevToolsPanel,
	mount,
	initDevTools,
	destroyDevTools,
	getContext,
} from "../../src/index";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { Header } from "../../src/components/Header";
import { SettingsPanel } from "../../src/components/SettingsPanel";
import { StatusIndicator } from "../../src/components/StatusIndicator";
import { UpdateItem } from "../../src/components/UpdateItem";
import { UpdatesContainer } from "../../src/components/UpdatesContainer";
import { GraphVisualization } from "../../src/components/Graph";
import type {
	DevToolsAdapter,
	Settings,
	ConnectionStatus,
	DependencyInfo,
} from "@preact/signals-devtools-adapter";

/**
 * Creates a mock DevToolsAdapter for testing
 */
function createMockAdapter(
	overrides: Partial<DevToolsAdapter> = {}
): DevToolsAdapter {
	const listeners: Map<string, Set<Function>> = new Map();

	return {
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
		sendConfig: vi.fn(),
		requestState: vi.fn(),
		on: vi.fn((event: string, listener: Function) => {
			if (!listeners.has(event)) {
				listeners.set(event, new Set());
			}
			listeners.get(event)!.add(listener);
			return () => {
				listeners.get(event)?.delete(listener);
			};
		}),
		getConnectionStatus: vi.fn().mockReturnValue({
			status: "connected",
			message: "Connected",
		} as ConnectionStatus),
		isSignalsAvailable: vi.fn().mockReturnValue(true),
		// Helper to emit events in tests
		_emit: (event: string, data: any) => {
			listeners.get(event)?.forEach(listener => listener(data));
		},
		...overrides,
	} as DevToolsAdapter & { _emit: (event: string, data: any) => void };
}

describe("@preact/signals-devtools-ui", () => {
	let scratch: HTMLDivElement;
	let mockAdapter: DevToolsAdapter & {
		_emit: (event: string, data: any) => void;
	};

	beforeEach(() => {
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		mockAdapter = createMockAdapter();
	});

	afterEach(() => {
		render(null, scratch);
		scratch.remove();
		try {
			destroyDevTools();
		} catch {
			// Context may not be initialized in all tests
		}
	});

	describe("Button", () => {
		it("should render with children", () => {
			const onClick = vi.fn();
			// @ts-expect-error
			render(<Button onClick={onClick}>Click me</Button>, scratch);

			const button = scratch.querySelector("button");
			expect(button).to.not.be.null;
			expect(button!.textContent).to.equal("Click me");
		});

		it("should call onClick when clicked", () => {
			const onClick = vi.fn();
			render(<Button onClick={onClick}>Click me</Button>, scratch);

			const button = scratch.querySelector("button")!;
			button.click();

			expect(onClick).toHaveBeenCalledOnce();
		});

		it("should apply primary variant class", () => {
			const onClick = vi.fn();
			render(
				<Button onClick={onClick} variant="primary">
					Primary
				</Button>,
				scratch
			);

			const button = scratch.querySelector("button")!;
			expect(button.classList.contains("btn-primary")).to.be.true;
		});

		it("should apply secondary variant class by default", () => {
			const onClick = vi.fn();
			render(<Button onClick={onClick}>Secondary</Button>, scratch);

			const button = scratch.querySelector("button")!;
			expect(button.classList.contains("btn-secondary")).to.be.true;
		});

		it("should apply active class when active", () => {
			const onClick = vi.fn();
			render(
				<Button onClick={onClick} active>
					Active
				</Button>,
				scratch
			);

			const button = scratch.querySelector("button")!;
			expect(button.classList.contains("active")).to.be.true;
		});

		it("should be disabled when disabled prop is true", () => {
			const onClick = vi.fn();
			render(
				<Button onClick={onClick} disabled>
					Disabled
				</Button>,
				scratch
			);

			const button = scratch.querySelector("button")!;
			expect(button.disabled).to.be.true;
		});

		it("should apply custom className", () => {
			const onClick = vi.fn();
			render(
				<Button onClick={onClick} className="custom-class">
					Custom
				</Button>,
				scratch
			);

			const button = scratch.querySelector("button")!;
			expect(button.classList.contains("custom-class")).to.be.true;
		});
	});

	describe("StatusIndicator", () => {
		it("should render status message", () => {
			render(
				<StatusIndicator status="connected" message="Connected to signals" />,
				scratch
			);

			const statusText = scratch.querySelector(".status-text");
			expect(statusText).to.not.be.null;
			expect(statusText!.textContent).to.equal("Connected to signals");
		});

		it("should apply correct status class", () => {
			render(
				<StatusIndicator status="connected" message="Connected" />,
				scratch
			);

			const container = scratch.querySelector(".connection-status");
			expect(container!.classList.contains("connected")).to.be.true;
		});

		it("should show indicator by default", () => {
			render(
				<StatusIndicator status="connecting" message="Connecting..." />,
				scratch
			);

			const indicator = scratch.querySelector(".status-indicator");
			expect(indicator).to.not.be.null;
		});

		it("should hide indicator when showIndicator is false", () => {
			render(
				<StatusIndicator
					status="connected"
					message="Connected"
					showIndicator={false}
				/>,
				scratch
			);

			const indicator = scratch.querySelector(".status-indicator");
			expect(indicator).to.be.null;
		});

		it("should apply disconnected status class", () => {
			render(
				<StatusIndicator status="disconnected" message="Disconnected" />,
				scratch
			);

			const container = scratch.querySelector(".connection-status");
			expect(container!.classList.contains("disconnected")).to.be.true;
		});

		it("should apply warning status class", () => {
			render(<StatusIndicator status="warning" message="Warning" />, scratch);

			const container = scratch.querySelector(".connection-status");
			expect(container!.classList.contains("warning")).to.be.true;
		});

		it("should apply custom className", () => {
			render(
				<StatusIndicator
					status="connected"
					message="Connected"
					className="my-custom-status"
				/>,
				scratch
			);

			const container = scratch.querySelector(".connection-status");
			expect(container!.classList.contains("my-custom-status")).to.be.true;
		});
	});

	describe("EmptyState", () => {
		it("should render default title and description", () => {
			const onRefresh = vi.fn();
			render(<EmptyState onRefresh={onRefresh} />, scratch);

			const title = scratch.querySelector("h2");
			const description = scratch.querySelector("p");

			expect(title!.textContent).to.equal("No Signals Detected");
			expect(description!.textContent).to.contain("@preact/signals-debug");
		});

		it("should render custom title and description", () => {
			const onRefresh = vi.fn();
			render(
				<EmptyState
					onRefresh={onRefresh}
					title="Custom Title"
					description="Custom description text"
				/>,
				scratch
			);

			const title = scratch.querySelector("h2");
			const description = scratch.querySelector("p");

			expect(title!.textContent).to.equal("Custom Title");
			expect(description!.textContent).to.equal("Custom description text");
		});

		it("should call onRefresh when button is clicked", () => {
			const onRefresh = vi.fn();
			render(<EmptyState onRefresh={onRefresh} />, scratch);

			const button = scratch.querySelector("button")!;
			button.click();

			expect(onRefresh).toHaveBeenCalledOnce();
		});

		it("should render custom button text", () => {
			const onRefresh = vi.fn();
			render(
				<EmptyState onRefresh={onRefresh} buttonText="Try Again" />,
				scratch
			);

			const button = scratch.querySelector("button")!;
			expect(button.textContent).to.equal("Try Again");
		});
	});

	describe("UpdateItem", () => {
		it("should render update signal name", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} />, scratch);

			const signalName = scratch.querySelector(".signal-name");
			expect(signalName!.textContent).to.contain("count");
		});

		it("should render effect signal name with effect type", () => {
			const update = {
				type: "effect" as const,
				signalType: "effect" as const,
				signalName: "logEffect",
				receivedAt: Date.now(),
			};

			render(<UpdateItem update={update} />, scratch);

			const signalName = scratch.querySelector(".signal-name");
			expect(signalName!.textContent).to.contain("logEffect");
		});

		it("should format and display prev and new values", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				prevValue: 42,
				newValue: 43,
				receivedAt: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} />, scratch);

			const prevValue = scratch.querySelector(".value-prev");
			const newValue = scratch.querySelector(".value-new");

			expect(prevValue!.textContent).to.equal("42");
			expect(newValue!.textContent).to.equal("43");
		});

		it("should format string values with quotes", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "message",
				prevValue: "hello",
				newValue: "world",
				receivedAt: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} />, scratch);

			const prevValue = scratch.querySelector(".value-prev");
			const newValue = scratch.querySelector(".value-new");

			expect(prevValue!.textContent).to.equal('"hello"');
			expect(newValue!.textContent).to.equal('"world"');
		});

		it("should format null and undefined values", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "value",
				prevValue: null,
				newValue: undefined,
				receivedAt: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} />, scratch);

			const prevValue = scratch.querySelector(".value-prev");
			const newValue = scratch.querySelector(".value-new");

			expect(prevValue!.textContent).to.equal("null");
			expect(newValue!.textContent).to.equal("undefined");
		});

		it("should display count badge when count is provided", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "counter",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} count={5} />, scratch);

			const countBadge = scratch.querySelector(".update-count");
			expect(countBadge).to.not.be.null;
			expect(countBadge!.textContent).to.equal("x5");
		});

		it("should display time", () => {
			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "counter",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
				timestamp: Date.now(),
				depth: 0,
			};

			render(<UpdateItem update={update} />, scratch);

			const time = scratch.querySelector(".update-time");
			expect(time).to.not.be.null;
			expect(time!.textContent).to.not.be.empty;
		});
	});

	describe("DevToolsPanel", () => {
		beforeEach(() => {
			initDevTools(mockAdapter);
		});

		it("should render header by default", () => {
			render(<DevToolsPanel />, scratch);

			const header = scratch.querySelector(".header");
			expect(header).to.not.be.null;
		});

		it("should hide header when hideHeader is true", () => {
			render(<DevToolsPanel hideHeader />, scratch);

			const header = scratch.querySelector(".header");
			expect(header).to.be.null;
		});

		it("should render tabs", () => {
			render(<DevToolsPanel />, scratch);

			const tabs = scratch.querySelectorAll(".tab");
			expect(tabs.length).to.equal(2);
			expect(tabs[0].textContent).to.equal("Updates");
			expect(tabs[1].textContent).to.equal("Dependency Graph");
		});

		it("should show updates tab as active by default", () => {
			render(<DevToolsPanel />, scratch);

			const updatesTab = scratch.querySelector(".tab.active");
			expect(updatesTab!.textContent).to.equal("Updates");
		});

		it("should show graph tab as active when initialTab is graph", () => {
			render(<DevToolsPanel initialTab="graph" />, scratch);

			const activeTab = scratch.querySelector(".tab.active");
			expect(activeTab!.textContent).to.equal("Dependency Graph");
		});

		it("should switch tabs when clicked", () => {
			render(<DevToolsPanel />, scratch);

			const graphTab = scratch.querySelectorAll(".tab")[1] as HTMLButtonElement;
			act(() => {
				graphTab.click();
			});

			const activeTab = scratch.querySelector(".tab.active");
			expect(activeTab!.textContent).to.equal("Dependency Graph");
		});

		it("should show empty state when not connected", () => {
			// Create adapter that reports not connected
			const disconnectedAdapter = createMockAdapter({
				isSignalsAvailable: vi.fn().mockReturnValue(false),
			});
			destroyDevTools();
			initDevTools(disconnectedAdapter);

			render(<DevToolsPanel />, scratch);

			const emptyState = scratch.querySelector(".empty-state");
			expect(emptyState).to.not.be.null;
		});

		it("should have main content area", () => {
			render(<DevToolsPanel />, scratch);

			const mainContent = scratch.querySelector(".main-content");
			expect(mainContent).to.not.be.null;
		});
	});

	describe("Header", () => {
		beforeEach(() => {
			initDevTools(mockAdapter);
		});

		it("should render title", () => {
			render(<Header />, scratch);

			const title = scratch.querySelector("h1");
			expect(title!.textContent).to.equal("Signals");
		});

		it("should render status indicator", () => {
			render(<Header />, scratch);

			const statusIndicator = scratch.querySelector(".connection-status");
			expect(statusIndicator).to.not.be.null;
		});

		it("should render control buttons", () => {
			render(<Header />, scratch);

			const buttons = scratch.querySelectorAll(".header-controls button");
			expect(buttons.length).to.be.greaterThan(0);
		});

		it("should have Clear button", () => {
			render(<Header />, scratch);

			const buttons = scratch.querySelectorAll(".header-controls button");
			const clearButton = Array.from(buttons).find(
				b => b.textContent === "Clear"
			);
			expect(clearButton).to.not.be.undefined;
		});

		it("should have Pause button", () => {
			render(<Header />, scratch);

			const buttons = scratch.querySelectorAll(".header-controls button");
			const pauseButton = Array.from(buttons).find(
				b => b.textContent === "Pause"
			);
			expect(pauseButton).to.not.be.undefined;
		});

		it("should have Settings button", () => {
			render(<Header />, scratch);

			const buttons = scratch.querySelectorAll(".header-controls button");
			const settingsButton = Array.from(buttons).find(
				b => b.textContent === "Settings"
			);
			expect(settingsButton).to.not.be.undefined;
		});

		it("should toggle pause state when Pause button is clicked", () => {
			render(<Header />, scratch);

			let buttons = scratch.querySelectorAll(".header-controls button");
			const pauseButton = Array.from(buttons).find(
				b => b.textContent === "Pause"
			) as HTMLButtonElement;

			act(() => {
				pauseButton.click();
			});

			// Re-query after click to get updated button text
			buttons = scratch.querySelectorAll(".header-controls button");
			const resumeButton = Array.from(buttons).find(
				b => b.textContent === "Resume"
			);
			expect(resumeButton).to.not.be.undefined;
		});
	});

	describe("UpdatesContainer", () => {
		beforeEach(() => {
			initDevTools(mockAdapter);
		});

		it("should render updates stats", () => {
			render(<UpdatesContainer />, scratch);

			const stats = scratch.querySelector(".updates-stats");
			expect(stats).to.not.be.null;
		});

		it("should display updates count", () => {
			render(<UpdatesContainer />, scratch);

			const updatesText = scratch.textContent;
			expect(updatesText).to.contain("Updates:");
		});

		it("should display signals count", () => {
			render(<UpdatesContainer />, scratch);

			const updatesText = scratch.textContent;
			expect(updatesText).to.contain("Signals:");
		});

		it("should have updates list container", () => {
			render(<UpdatesContainer />, scratch);

			const updatesList = scratch.querySelector(".updates-list");
			expect(updatesList).to.not.be.null;
		});
	});

	describe("mount function", () => {
		it("should mount DevTools panel into container", async () => {
			const container = document.createElement("div");
			document.body.appendChild(container);

			const unmount = await mount({
				adapter: mockAdapter,
				container,
			});

			expect(container.querySelector(".signals-devtools")).to.not.be.null;
			expect(mockAdapter.connect).toHaveBeenCalled();

			unmount();
			container.remove();
		});

		it("should call adapter.connect on mount", async () => {
			const container = document.createElement("div");
			document.body.appendChild(container);

			const unmount = await mount({
				adapter: mockAdapter,
				container,
			});

			expect(mockAdapter.connect).toHaveBeenCalledOnce();

			unmount();
			container.remove();
		});

		it("should accept hideHeader option", async () => {
			const container = document.createElement("div");
			document.body.appendChild(container);

			const unmount = await mount({
				adapter: mockAdapter,
				container,
				hideHeader: true,
			});

			expect(container.querySelector(".header")).to.be.null;

			unmount();
			container.remove();
		});

		it("should accept initialTab option", async () => {
			const container = document.createElement("div");
			document.body.appendChild(container);

			const unmount = await mount({
				adapter: mockAdapter,
				container,
				initialTab: "graph",
			});

			const activeTab = container.querySelector(".tab.active");
			expect(activeTab!.textContent).to.equal("Dependency Graph");

			unmount();
			container.remove();
		});

		it("should call adapter.disconnect on unmount", async () => {
			const container = document.createElement("div");
			document.body.appendChild(container);

			const unmount = await mount({
				adapter: mockAdapter,
				container,
			});

			unmount();

			expect(mockAdapter.disconnect).toHaveBeenCalled();
			container.remove();
		});
	});

	describe("Context", () => {
		it("should throw error when getContext is called before init", () => {
			expect(() => getContext()).to.throw("DevTools context not initialized");
		});

		it("should return context after initDevTools", () => {
			initDevTools(mockAdapter);

			const context = getContext();
			expect(context).to.not.be.null;
			expect(context.adapter).to.equal(mockAdapter);
		});

		it("should have connectionStore in context", () => {
			initDevTools(mockAdapter);

			const context = getContext();
			expect(context.connectionStore).to.not.be.undefined;
		});

		it("should have updatesStore in context", () => {
			initDevTools(mockAdapter);

			const context = getContext();
			expect(context.updatesStore).to.not.be.undefined;
		});

		it("should have settingsStore in context", () => {
			initDevTools(mockAdapter);

			const context = getContext();
			expect(context.settingsStore).to.not.be.undefined;
		});

		it("should clear context on destroyDevTools", () => {
			initDevTools(mockAdapter);
			destroyDevTools();

			expect(() => getContext()).to.throw("DevTools context not initialized");
		});
	});

	describe("ConnectionStore", () => {
		it("should have initial connecting status", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			// Initial status before any events
			expect(context.connectionStore.status).to.be.a("string");
		});

		it("should update status on connectionStatusChanged event", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			mockAdapter._emit("connectionStatusChanged", {
				status: "connected",
				message: "Connected to signals",
			});

			expect(context.connectionStore.status).to.equal("connected");
			expect(context.connectionStore.message).to.equal("Connected to signals");
		});

		it("should update isConnected on signalsAvailable event", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			mockAdapter._emit("signalsAvailable", true);

			expect(context.connectionStore.isConnected).to.be.true;
		});

		it("should call requestState on refreshConnection", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			context.connectionStore.refreshConnection();

			expect(mockAdapter.requestState).toHaveBeenCalled();
		});
	});

	describe("UpdatesStore", () => {
		it("should start with empty updates", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			expect(context.updatesStore.hasUpdates.value).to.be.false;
		});

		it("should add updates when signalUpdate event is received", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
			};

			mockAdapter._emit("signalUpdate", [update]);

			expect(context.updatesStore.hasUpdates.value).to.be.true;
		});

		it("should not add updates when paused", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			context.updatesStore.isPaused.value = true;

			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
			};

			mockAdapter._emit("signalUpdate", [update]);

			expect(context.updatesStore.hasUpdates.value).to.be.false;
		});

		it("should clear updates on clearUpdates", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			const update = {
				type: "update" as const,
				signalType: "signal" as const,
				signalName: "count",
				prevValue: 0,
				newValue: 1,
				receivedAt: Date.now(),
			};

			mockAdapter._emit("signalUpdate", [update]);
			expect(context.updatesStore.hasUpdates.value).to.be.true;

			context.updatesStore.clearUpdates();
			expect(context.updatesStore.hasUpdates.value).to.be.false;
		});

		it("should track signal counts", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			const updates = [
				{
					type: "update" as const,
					signalType: "signal" as const,
					signalName: "count",
					prevValue: 0,
					newValue: 1,
					receivedAt: Date.now(),
				},
				{
					type: "update" as const,
					signalType: "signal" as const,
					signalName: "count",
					prevValue: 1,
					newValue: 2,
					receivedAt: Date.now(),
				},
				{
					type: "update" as const,
					signalType: "signal" as const,
					signalName: "name",
					prevValue: "a",
					newValue: "b",
					receivedAt: Date.now(),
				},
			];

			mockAdapter._emit("signalUpdate", updates);

			const signalCounts = context.updatesStore.signalCounts.value;
			expect(signalCounts.get("count")).to.equal(2);
			expect(signalCounts.get("name")).to.equal(1);
		});

		it("should track disposed signal IDs", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			const disposal = {
				type: "disposed" as const,
				signalType: "signal" as const,
				signalName: "count",
				signalId: "signal-123",
				timestamp: Date.now(),
			};

			mockAdapter._emit("signalDisposed", [disposal]);

			expect(context.updatesStore.disposedSignalIds.value.has("signal-123")).to
				.be.true;
		});
	});

	describe("SettingsStore", () => {
		it("should have default settings", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			expect(context.settingsStore.settings.enabled).to.be.true;
			expect(context.settingsStore.settings.grouped).to.be.true;
			expect(context.settingsStore.settings.maxUpdatesPerSecond).to.equal(60);
		});

		it("should apply settings and call sendConfig", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			const newSettings = {
				enabled: false,
				grouped: false,
				maxUpdatesPerSecond: 30,
				filterPatterns: ["test"],
			};

			context.settingsStore.applySettings(newSettings);

			expect(mockAdapter.sendConfig).toHaveBeenCalledWith(newSettings);
			expect(context.settingsStore.settings.enabled).to.be.false;
			expect(context.settingsStore.settings.maxUpdatesPerSecond).to.equal(30);
		});

		it("should update settings on configReceived event", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			mockAdapter._emit("configReceived", {
				settings: {
					enabled: false,
					grouped: false,
					maxUpdatesPerSecond: 100,
					filterPatterns: ["pattern"],
				},
			});

			expect(context.settingsStore.settings.enabled).to.be.false;
			expect(context.settingsStore.settings.maxUpdatesPerSecond).to.equal(100);
		});

		it("should toggle showDisposedSignals", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			expect(context.settingsStore.showDisposedSignals).to.be.false;

			context.settingsStore.toggleShowDisposedSignals();
			expect(context.settingsStore.showDisposedSignals).to.be.true;
		});
	});

	describe("GraphVisualization - Dependency Node Creation", () => {
		beforeEach(() => {
			initDevTools(mockAdapter);
		});

		it("should render empty state when no updates", () => {
			render(<GraphVisualization />, scratch);

			const emptyState = scratch.querySelector(".graph-empty");
			expect(emptyState).to.not.be.null;
			expect(emptyState!.textContent).to.contain("No Signal Dependencies");
		});

		it("should create nodes from allDependencies even if dependency never updated", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			// Simulate an update where a computed depends on signals that never sent updates themselves
			// This tests the key feature: allDependencies with rich info allows graph to show
			// dependencies that haven't had their own updates
			const updateWithDependencies = {
				type: "update" as const,
				signalType: "computed" as const,
				signalName: "sum",
				signalId: "computed-sum-1",
				prevValue: 0,
				newValue: 10,
				receivedAt: Date.now(),
				depth: 1,
				subscribedTo: "signal-a-1",
				// Rich dependency info - these signals never sent updates themselves
				allDependencies: [
					{ id: "signal-a-1", name: "signalA", type: "signal" as const },
					{ id: "signal-b-1", name: "signalB", type: "signal" as const },
				] as DependencyInfo[],
			};

			// Add the update to the store
			mockAdapter._emit("signalUpdate", [updateWithDependencies]);

			render(<GraphVisualization />, scratch);

			// The graph should now show all three nodes:
			// - sum (the computed that updated)
			// - signalA (dependency that never updated, but included in allDependencies)
			// - signalB (dependency that never updated, but included in allDependencies)
			const nodes = scratch.querySelectorAll(".graph-node");
			expect(nodes.length).to.equal(3);

			// Check that nodes have correct names rendered
			const nodeTexts = scratch.querySelectorAll(".graph-text");
			const textContents = Array.from(nodeTexts).map(t => t.textContent);
			expect(textContents).to.include("sum");
			expect(textContents).to.include("signalA");
			expect(textContents).to.include("signalB");
		});

		it("should create nodes with correct types from allDependencies", () => {
			initDevTools(mockAdapter);
			const context = getContext();

			// Test with mixed dependency types (signal and computed)
			const updateWithMixedDeps = {
				type: "update" as const,
				signalType: "computed" as const,
				signalName: "result",
				signalId: "computed-result-1",
				prevValue: 0,
				newValue: 15,
				receivedAt: Date.now(),
				depth: 2,
				allDependencies: [
					{ id: "signal-base-1", name: "base", type: "signal" as const },
					{
						id: "computed-doubled-1",
						name: "doubled",
						type: "computed" as const,
					},
				] as DependencyInfo[],
			};

			mockAdapter._emit("signalUpdate", [updateWithMixedDeps]);

			render(<GraphVisualization />, scratch);

			// Check that nodes have correct CSS classes for their types
			const signalNode = scratch.querySelector(".graph-node.signal");
			const computedNodes = scratch.querySelectorAll(".graph-node.computed");

			expect(signalNode).to.not.be.null;
			// Should have 2 computed nodes: 'doubled' from deps and 'result' from the update
			expect(computedNodes.length).to.equal(2);
		});

		it("should create links from allDependencies to the updating node", () => {
			initDevTools(mockAdapter);

			const updateWithDeps = {
				type: "update" as const,
				signalType: "computed" as const,
				signalName: "total",
				signalId: "computed-total-1",
				prevValue: 0,
				newValue: 100,
				receivedAt: Date.now(),
				depth: 1,
				allDependencies: [
					{ id: "signal-x-1", name: "x", type: "signal" as const },
					{ id: "signal-y-1", name: "y", type: "signal" as const },
				] as DependencyInfo[],
			};

			mockAdapter._emit("signalUpdate", [updateWithDeps]);

			render(<GraphVisualization />, scratch);

			// Should have links from both dependencies to the computed
			const links = scratch.querySelectorAll(".graph-link");
			expect(links.length).to.equal(2);
		});

		it("should not duplicate nodes when dependency appears in multiple updates", () => {
			initDevTools(mockAdapter);

			// First update
			const update1 = {
				type: "update" as const,
				signalType: "computed" as const,
				signalName: "doubledA",
				signalId: "computed-doubled-a-1",
				prevValue: 0,
				newValue: 10,
				receivedAt: Date.now(),
				depth: 1,
				allDependencies: [
					{ id: "signal-shared-1", name: "shared", type: "signal" as const },
				] as DependencyInfo[],
			};

			// Second update that also depends on the same signal
			const update2 = {
				type: "update" as const,
				signalType: "computed" as const,
				signalName: "doubledB",
				signalId: "computed-doubled-b-1",
				prevValue: 0,
				newValue: 20,
				receivedAt: Date.now() + 1,
				depth: 1,
				allDependencies: [
					{ id: "signal-shared-1", name: "shared", type: "signal" as const },
				] as DependencyInfo[],
			};

			mockAdapter._emit("signalUpdate", [update1, update2]);

			render(<GraphVisualization />, scratch);

			// Should have exactly 3 nodes: shared, doubledA, doubledB
			// The 'shared' signal should not be duplicated
			const nodes = scratch.querySelectorAll(".graph-node");
			expect(nodes.length).to.equal(3);

			// Check that shared appears exactly once in the graph text
			const nodeTexts = scratch.querySelectorAll(".graph-text");
			const sharedCount = Array.from(nodeTexts).filter(
				t => t.textContent === "shared"
			).length;
			expect(sharedCount).to.equal(1);
		});
	});
});
