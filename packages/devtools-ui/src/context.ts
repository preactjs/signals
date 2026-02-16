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

export function getContext(): DevToolsContext {
	if (!currentContext) {
		throw new Error(
			"DevTools context not initialized. Call initDevTools() first."
		);
	}
	return currentContext;
}

export function initDevTools(adapter: DevToolsAdapter): DevToolsContext {
	const settingsStore = new SettingsModel(adapter);
	const updatesStore = new UpdatesModel(adapter, settingsStore);
	const connectionStore = new ConnectionModel(adapter);
	const themeStore = new ThemeModel();

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
		currentContext.connectionStore[Symbol.dispose]();
		currentContext.updatesStore[Symbol.dispose]();
		currentContext.settingsStore[Symbol.dispose]();
		currentContext.themeStore[Symbol.dispose]();
		currentContext.adapter.disconnect();
		currentContext = null;
	}
}
