// Chrome extension global types
declare global {
	namespace chrome {
		export namespace tabs {
			export interface Tab {
				id?: number;
				url?: string;
				title?: string;
				active?: boolean;
				highlighted?: boolean;
				windowId?: number;
				index?: number;
			}

			export function query(queryInfo: {
				active?: boolean;
				currentWindow?: boolean;
				url?: string | string[];
			}): Promise<Tab[]>;

			export function sendMessage(
				tabId: number,
				message: any,
				options?: object,
				responseCallback?: (response: any) => void
			): Promise<any>;
		}

		export namespace scripting {
			export interface ScriptInjection {
				target: {
					tabId: number;
					allFrames?: boolean;
				};
				files?: string[];
				func?: Function;
			}

			export function executeScript(injection: ScriptInjection): Promise<any[]>;
		}
	}
}

// Extension message types
export interface ExtensionMessage {
	type: string;
	data?: any;
}

export interface StatusInfo {
	status: "connected" | "disconnected";
	message: string;
}
