// Background service worker for the extension

// Maps to store connections by tab ID
const contentConnections = new Map(); // tab ID -> content script port
const devtoolsConnections = new Map(); // tab ID -> devtools port

chrome.runtime.onConnect.addListener(port => {
	if (port.name === "content-to-background") {
		handleContentScriptConnection(port);
	} else if (port.name === "devtools-to-background") {
		handleDevToolsConnection(port);
	} else {
		console.warn("Unknown connection type:", port.name);
		port.disconnect();
	}
});

function handleContentScriptConnection(port) {
	const tabId = port.sender?.tab?.id;

	if (!tabId) {
		console.error("Content script connection missing tab ID");
		port.disconnect();
		return;
	}

	contentConnections.set(tabId, port);

	port.onMessage.addListener(message => {
		// Forward message to devtools if connected
		const devtoolsPort = devtoolsConnections.get(tabId);
		if (devtoolsPort) {
			try {
				devtoolsPort.postMessage(message);
			} catch (error) {
				console.error("Failed to forward message to devtools:", error);
				devtoolsConnections.delete(tabId);
			}
		} else {
			console.log(
				`No devtools connection for tab ${tabId}, message queued:`,
				message.type
			);
		}
	});

	port.onDisconnect.addListener(() => {
		contentConnections.delete(tabId);

		// Notify devtools if connected
		const devtoolsPort = devtoolsConnections.get(tabId);
		if (devtoolsPort) {
			try {
				devtoolsPort.postMessage({ type: "CONTENT_SCRIPT_DISCONNECTED" });
			} catch (error) {
				console.error(
					"Failed to notify devtools of content script disconnect:",
					error
				);
			}
		}
	});
}

function handleDevToolsConnection(port) {
	let tabId = null;
	let isInitialized = false;

	// Listen for the initial tab ID message
	const tabIdListener = message => {
		if (message.type === "DEVTOOLS_TAB_ID" && !isInitialized) {
			tabId = message.tabId;
			isInitialized = true;

			devtoolsConnections.set(tabId, port);

			// Remove the tab ID listener
			port.onMessage.removeListener(tabIdListener);

			// Set up the main message listener
			port.onMessage.addListener(message => {
				// Forward message to content script if connected
				const contentPort = contentConnections.get(tabId);
				if (contentPort) {
					try {
						contentPort.postMessage(message);
					} catch (error) {
						console.error(
							"Failed to forward message to content script:",
							error
						);
						contentConnections.delete(tabId);
					}
				} else {
					console.log(`No content script connection for tab ${tabId}`);
				}
			});

			// Send initial status to devtools
			const contentPort = contentConnections.get(tabId);
			try {
				port.postMessage({
					type: "BACKGROUND_READY",
					contentScriptConnected: !!contentPort,
				});
			} catch (error) {
				console.error("Failed to send initial status to devtools:", error);
			}
		}
	};

	port.onMessage.addListener(tabIdListener);

	port.onDisconnect.addListener(() => {
		if (tabId) {
			devtoolsConnections.delete(tabId);
		}
	});
}

chrome.action.onClicked.addListener(tab => {
	chrome.tabs.sendMessage(tab.id, { type: "OPEN_DEVTOOLS_HINT" });
});

// Clean up connections when tabs are closed
chrome.tabs.onRemoved.addListener(tabId => {
	contentConnections.delete(tabId);
	devtoolsConnections.delete(tabId);
});
