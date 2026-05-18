import type { DevToolsAdapter } from "@preact/signals-devtools-adapter";
import { ConnectionModel } from "./models/ConnectionModel";
import { SettingsModel } from "./models/SettingsModel";
import { ThemeModel } from "./models/ThemeModel";
import { UpdatesModel } from "./models/UpdatesModel";

export { ConnectionModel, SettingsModel, ThemeModel, UpdatesModel };
export type {
	SignalUpdate,
	Divider,
	UpdateTreeNode,
	UpdateTreeNodeSingle,
	UpdateTreeNodeGroup,
} from "./models/UpdatesModel";
export type { ThemeMode } from "./models/ThemeModel";

export interface DevToolsContext {
	adapter: DevToolsAdapter;
	connectionStore: InstanceType<typeof ConnectionModel>;
	updatesStore: InstanceType<typeof UpdatesModel>;
	settingsStore: InstanceType<typeof SettingsModel>;
	themeStore: InstanceType<typeof ThemeModel>;
}

let currentContext: DevToolsContext | null = null;

function createContextStores(adapter: DevToolsAdapter): DevToolsContext {
	const settingsStore = new SettingsModel(adapter);
	return {
		adapter,
		connectionStore: new ConnectionModel(adapter),
		updatesStore: new UpdatesModel(adapter, settingsStore),
		settingsStore,
		themeStore: new ThemeModel(),
	};
}

export function createDevToolsContext(
	adapter: DevToolsAdapter
): DevToolsContext {
	return createContextStores(adapter);
}

export function getContext(): DevToolsContext {
	if (!currentContext) {
		throw new Error(
			"DevTools context not initialized. Call initDevTools() first."
		);
	}
	return currentContext;
}

export function initDevTools(adapter: DevToolsAdapter): DevToolsContext {
	currentContext = createContextStores(adapter);

	return currentContext;
}

export function setCurrentDevToolsContext(
	context: DevToolsContext | null
): DevToolsContext | null {
	currentContext = context;
	return currentContext;
}

export function destroyDevToolsContext(context: DevToolsContext): void {
	context.connectionStore[Symbol.dispose]();
	context.updatesStore[Symbol.dispose]();
	context.settingsStore[Symbol.dispose]();
	context.themeStore[Symbol.dispose]();
	context.adapter.disconnect();

	if (currentContext === context) {
		currentContext = null;
	}
}

export function destroyDevTools(): void {
	if (currentContext) {
		destroyDevToolsContext(currentContext);
	}
}
