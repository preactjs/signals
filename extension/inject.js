// Injected script that runs in the page context to communicate with the Preact Signals debug package
(function () {
	"use strict";

	let devtoolsAPI = null;
	let isConnected = false;
	let checkAttempts = 0;
	const MAX_CHECK_ATTEMPTS = 100; // 10 seconds with 100ms intervals

	// Wait for the Preact Signals debug package to be available
	function initSignalsDevtools() {
		try {
			if (window.__PREACT_SIGNALS_DEVTOOLS__) {
				devtoolsAPI = window.__PREACT_SIGNALS_DEVTOOLS__;

				// Listen for signal updates
				const updateUnsubscribe = devtoolsAPI.onUpdate(updates => {
					window.postMessage(
						{
							type: "SIGNALS_UPDATE_FROM_PAGE",
							payload: { updates },
							timestamp: Date.now(),
						},
						window.location.origin
					);
				});

				// Listen for signal disposals
				let disposalUnsubscribe = () => {};
				if (devtoolsAPI.onDisposal) {
					disposalUnsubscribe = devtoolsAPI.onDisposal(disposals => {
						window.postMessage(
							{
								type: "SIGNALS_DISPOSED",
								payload: { disposals },
								timestamp: Date.now(),
							},
							window.location.origin
						);
					});
				}

				// Listen for initialization
				const initUnsubscribe = devtoolsAPI.onInit(() => {
					window.postMessage(
						{
							type: "SIGNALS_INIT_FROM_PAGE",
							timestamp: Date.now(),
						},
						window.location.origin
					);
				});

				// Store cleanup functions
				window.__PREACT_SIGNALS_DEVTOOLS_CLEANUP__ = () => {
					updateUnsubscribe();
					disposalUnsubscribe();
					initUnsubscribe();
				};

				// Announce that the extension is connected
				if (!isConnected) {
					window.postMessage(
						{
							type: "DEVTOOLS_CONNECTED",
						},
						window.location.origin
					);
					isConnected = true;
				}

				// Signal that signals are available
				window.postMessage(
					{
						type: "SIGNALS_AVAILABLE",
						payload: { available: true },
					},
					window.location.origin
				);

				return true;
			}
		} catch (error) {
			console.error("Error initializing Signals DevTools:", error);
		}
		return false;
	}

	// Try to initialize immediately
	if (!initSignalsDevtools()) {
		// If not available, keep checking
		const checkInterval = setInterval(() => {
			checkAttempts++;

			if (initSignalsDevtools()) {
				clearInterval(checkInterval);
			} else if (checkAttempts >= MAX_CHECK_ATTEMPTS) {
				clearInterval(checkInterval);
				window.postMessage(
					{
						type: "SIGNALS_AVAILABLE",
						payload: { available: false },
					},
					window.location.origin
				);
			}
		}, 100);
	}

	// Also listen for the API becoming available via postMessage
	// This handles cases where the debug package loads after the extension
	window.addEventListener("message", event => {
		if (
			event.source === window &&
			event.origin === window.location.origin &&
			event.data.type === "SIGNALS_AVAILABLE" &&
			event.data.payload?.available &&
			!devtoolsAPI
		) {
			// Try to initialize when we get the availability message
			setTimeout(() => {
				if (!devtoolsAPI) {
					initSignalsDevtools();
				}
			}, 50);
		}
	}); // Listen for configuration messages from the extension
	window.addEventListener("message", event => {
		// Only process messages from the content script (same origin)
		if (event.source !== window || event.origin !== window.location.origin) {
			return;
		}

		const { type, payload } = event.data;

		try {
			switch (type) {
				case "CONFIGURE_DEBUG_FROM_EXTENSION":
					// Forward configuration to the debug system
					if (devtoolsAPI && devtoolsAPI.sendConfig) {
						devtoolsAPI.sendConfig(payload);
					}
					window.postMessage(
						{
							type: "CONFIGURE_DEBUG",
							payload: payload,
						},
						window.location.origin
					);
					break;

				case "REQUEST_STATE_FROM_EXTENSION":
					// Request current state from the debug system
					window.postMessage(
						{
							type: "REQUEST_STATE",
						},
						window.location.origin
					);

					// Also send current availability status
					window.postMessage(
						{
							type: "SIGNALS_AVAILABLE",
							payload: { available: !!devtoolsAPI },
						},
						window.location.origin
					);
					break;

				case "CONTENT_SCRIPT_READY":
					window.postMessage(
						{
							type: "SIGNALS_AVAILABLE",
							payload: { available: !!devtoolsAPI },
						},
						window.location.origin
					);
					break;
			}
		} catch (error) {
			console.error("Error handling message from extension:", error);
		}
	});

	// Cleanup on page unload
	window.addEventListener("beforeunload", () => {
		if (window.__PREACT_SIGNALS_DEVTOOLS_CLEANUP__) {
			try {
				window.__PREACT_SIGNALS_DEVTOOLS_CLEANUP__();
			} catch (error) {
				console.error("Error during cleanup:", error);
			}
		}
	});
})();
