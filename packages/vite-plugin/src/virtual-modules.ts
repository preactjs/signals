export const VIRTUAL_MODULE_ID = "virtual:signals-agent-client";
export const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
export const VIRTUAL_ENTRY_MODULE_ID = "virtual:signals-agent-entry";
export const RESOLVED_VIRTUAL_ENTRY_MODULE_ID = `\0${VIRTUAL_ENTRY_MODULE_ID}`;

export interface SignalsAgentEntryModuleOptions {
	autoImportDebug: boolean;
	installClient: boolean;
}

export function createEntryModuleCode(
	options: SignalsAgentEntryModuleOptions
): string {
	return [
		options.autoImportDebug
			? `import ${JSON.stringify("@preact/signals-debug")};`
			: null,
		options.installClient
			? `import { installSignalsAgentClient } from ${JSON.stringify(
					VIRTUAL_MODULE_ID
				)};`
			: null,
		options.installClient ? "installSignalsAgentClient();" : null,
	]
		.filter(Boolean)
		.join("\n");
}

export function toViteModuleUrl(id: string): string {
	return id.startsWith("\0") ? `/@id/__x00__${id.slice(1)}` : `/@id/${id}`;
}
