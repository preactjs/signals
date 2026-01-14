import { mount } from "@preact/signals-devtools-ui";
import { createBrowserExtensionAdapter } from "@preact/signals-devtools-adapter";

// Initialize the panel when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
	const container = document.getElementById("app");
	if (!container) {
		console.error("Could not find #app container");
		return;
	}

	// Create the browser extension adapter
	const adapter = createBrowserExtensionAdapter();

	// Mount the DevTools UI
	try {
		await mount({
			adapter,
			container,
		});
	} catch (error) {
		console.error("Failed to mount DevTools panel:", error);
	}
});
