// Content script that injects the bridge script into the page context
// and communicates with the DevTools panel

let connectionPort = null;
let isSignalsAvailable = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
let __HAS_BRIDGE_SCRIPT__ = false;

// Inject the bridge script into the page context
function injectBridgeScript() {
	try {
		const script = document.createElement("script");
		script.src = chrome.runtime.getURL("inject.js");
		script.setAttribute("data-signals-devtools", "true");

		script.onload = function () {
			script.remove();
		};

		script.onerror = function () {
			console.error("Failed to load Preact Signals DevTools inject script");
			script.remove();
		};

		// Inject into the page as early as possible
		const target = document.head || document.documentElement || document;
		target.appendChild(script);
		__HAS_BRIDGE_SCRIPT__ = true;
	} catch (error) {
		console.error("Failed to inject bridge script:", error);
	}
}

// Inject the script as early as possible
if (!__HAS_BRIDGE_SCRIPT__) {
	injectBridgeScript();
}

// Listen for messages from the injected script
window.addEventListener("message", event => {
	// Only accept messages from same origin for security
	if (event.source !== window || event.origin !== window.location.origin) {
		return;
	}

	const { type, payload } = event.data;

	switch (type) {
		case "SIGNALS_UPDATE":
			forwardToDevTools({
				type: "SIGNALS_UPDATE",
				payload: payload,
				timestamp: event.data.timestamp,
			});
			break;

		case "SIGNALS_INIT_FROM_PAGE":
			forwardToDevTools({
				type: "SIGNALS_INIT",
				timestamp: event.data.timestamp,
			});
			break;

		case "SIGNALS_AVAILABLE":
			isSignalsAvailable = payload.available;
			forwardToDevTools({
				type: "SIGNALS_AVAILABILITY",
				payload: payload,
			});
			break;

		case "SIGNALS_CONFIG_FROM_PAGE":
			forwardToDevTools({
				type: "SIGNALS_CONFIG",
				payload: payload,
			});
			break;
	}
});

// Forward messages to DevTools panel via background script
function forwardToDevTools(message) {
	if (connectionPort) {
		try {
			connectionPort.postMessage(message);
		} catch (error) {
			console.error("Failed to send message to background:", error);
			// Port might be disconnected, try to reconnect
			connectionPort = null;
			connectToBackground();
			if (connectionPort) {
				try {
					connectionPort.postMessage(message);
				} catch (retryError) {
					console.error(
						"Failed to send message after reconnection:",
						retryError
					);
				}
			}
		}
	} else {
		// Try to establish connection
		connectToBackground();
		if (connectionPort) {
			try {
				connectionPort.postMessage(message);
			} catch (error) {
				console.error("Failed to send message on new connection:", error);
			}
		}
	}
}

// Connect to background script
function connectToBackground() {
	if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
		console.error("Max connection attempts reached, giving up");
		return;
	}

	try {
		connectionAttempts++;
		connectionPort = chrome.runtime.connect({ name: "content-to-background" });

		connectionPort.onMessage.addListener(message => {
			handleMessageFromDevTools(message);
		});

		connectionPort.onDisconnect.addListener(() => {
			connectionPort = null;

			// Send disconnect message to page
			window.postMessage(
				{
					type: "DEVTOOLS_DISCONNECTED",
				},
				"*"
			);

			// Reset connection attempts after a delay
			setTimeout(() => {
				connectionAttempts = 0;
			}, 5000);
		});

		// Reset connection attempts on successful connection
		connectionAttempts = 0;
	} catch (error) {
		console.error("Failed to connect to background script:", error);
		connectionPort = null;
	}
}

// Handle messages from DevTools panel (via background script)
function handleMessageFromDevTools(message) {
	const { type, payload } = message;

	switch (type) {
		case "CONFIGURE_DEBUG":
			window.postMessage(
				{
					type: "CONFIGURE_DEBUG_FROM_EXTENSION",
					payload: payload,
				},
				"*"
			);
			break;

		case "REQUEST_STATE":
			window.postMessage(
				{
					type: "REQUEST_STATE_FROM_EXTENSION",
				},
				"*"
			);

			// Also manually trigger a state check
			setTimeout(() => {
				window.postMessage(
					{
						type: "CONTENT_SCRIPT_READY",
					},
					"*"
				);
			}, 100);
			break;

		case "OPEN_DEVTOOLS_HINT":
			break;

		default:
			console.log("Unhandled message from DevTools:", message);
	}
}

// Listen for messages from background script (for extension icon clicks, etc.)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessageFromDevTools(message);
	return true; // Keep the message channel open for async response
});

// Initial connection attempt
connectToBackground();

// Announce presence to the page
window.postMessage(
	{
		type: "CONTENT_SCRIPT_READY",
	},
	"*"
);
