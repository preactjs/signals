// Core types and interfaces
export type {
	DevToolsAdapter,
	AdapterEvents,
	AdapterFactory,
	Unsubscribe,
	SignalUpdate,
	Settings,
	ConnectionStatus,
	ConnectionStatusType,
	DebugConfig,
	SignalDisposed,
} from "./types";

// Base adapter class
export { BaseAdapter } from "./base-adapter";

// Browser extension adapter
export {
	BrowserExtensionAdapter,
	createBrowserExtensionAdapter,
	type BrowserExtensionAdapterOptions,
} from "./browser-extension-adapter";

// Direct adapter
export {
	DirectAdapter,
	createDirectAdapter,
	type DirectAdapterOptions,
} from "./direct-adapter";

// PostMessage adapter
export {
	PostMessageAdapter,
	createPostMessageAdapter,
	type PostMessageAdapterOptions,
} from "./postmessage-adapter";
