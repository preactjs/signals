// DevTools initialization script
// This script runs in the DevTools context and creates the Signals panel

chrome.devtools.panels.create(
	"Signals",
	"icons/icon16.png",
	"panel.html",
	panel => {
		let panelWindow = null;
		let devtoolsPort = null;
		let isConnected = false;

		// Establish connection with background script
		function connectToBackground() {
			try {
				// Include the inspected tab ID in the connection
				devtoolsPort = chrome.runtime.connect({
					name: "devtools-to-background",
					// Note: We'll send the tab ID in the first message since we can't include it in connect()
				});
				isConnected = true;

				// Send the tab ID as the first message
				const tabId = chrome.devtools.inspectedWindow.tabId;
				devtoolsPort.postMessage({
					type: "DEVTOOLS_TAB_ID",
					tabId: tabId,
				});

				devtoolsPort.onMessage.addListener(message => {
					if (panelWindow) {
						try {
							panelWindow.postMessage(message, "*");
						} catch (error) {
							console.error(
								"Failed to forward message to panel window:",
								error
							);
						}
					} else {
						console.log("Panel window not available, message queued");
					}
				});

				devtoolsPort.onDisconnect.addListener(() => {
					devtoolsPort = null;
					isConnected = false;

					if (panelWindow) {
						try {
							panelWindow.postMessage({ type: "CONNECTION_LOST" }, "*");
						} catch (error) {
							console.error(
								"Failed to notify panel of connection loss:",
								error
							);
						}
					}

					// Attempt to reconnect after a delay
					setTimeout(() => {
						if (!isConnected) {
							connectToBackground();
						}
					}, 1000);
				});
			} catch (error) {
				console.error("Failed to connect to background script:", error);
				devtoolsPort = null;
				isConnected = false;
			}
		}

		// Panel lifecycle
		panel.onShown.addListener(window => {
			panelWindow = window;

			// Connect to background script when panel is shown
			if (!devtoolsPort) {
				connectToBackground();
			}

			// Listen for messages from the panel
			window.addEventListener("message", event => {
				if (event.source === window && devtoolsPort) {
					try {
						devtoolsPort.postMessage(event.data);
					} catch (error) {
						console.error("Failed to send message to background:", error);
						// Try to reconnect
						connectToBackground();
					}
				}
			});

			// Send initial connection message
			setTimeout(() => {
				if (devtoolsPort && panelWindow) {
					try {
						panelWindow.postMessage(
							{
								type: "DEVTOOLS_READY",
								connected: isConnected,
							},
							"*"
						);
					} catch (error) {
						console.error("Failed to send initial status to panel:", error);
					}
				}
			}, 100);
		});

		panel.onHidden.addListener(() => {
			// Don't disconnect port when panel is hidden, just clear reference
			panelWindow = null;
		});

		// Initial connection attempt
		connectToBackground();
	}
);
