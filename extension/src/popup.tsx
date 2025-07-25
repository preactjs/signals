import { render, h, Fragment } from "preact";
import { useSignal, useSignalEffect } from "@preact/signals";

interface StatusProps {
	status: "connected" | "disconnected";
	message: string;
}

function StatusIndicator({ status, message }: StatusProps) {
	return (
		<div className={`status ${status}`}>
			<div className="status-indicator"></div>
			<span>{message}</span>
		</div>
	);
}

interface ActionButtonProps {
	onClick: () => void;
	className?: string;
	children: preact.ComponentChildren;
}

function ActionButton({
	onClick,
	className = "btn",
	children,
}: ActionButtonProps) {
	return (
		<button onClick={onClick} className={className}>
			{children}
		</button>
	);
}

function InfoSection() {
	return (
		<div className="info">
			<p>
				<strong>How to use:</strong>
			</p>
			<ul style={{ margin: "8px 0", paddingLeft: "16px" }}>
				<li>Open DevTools (F12)</li>
				<li>Navigate to the "Signals" tab</li>
				<li>Interact with your app to see signal updates</li>
			</ul>
		</div>
	);
}

function PopupApp() {
	const status = useSignal<StatusProps>({
		status: "disconnected",
		message: "Not connected to any page",
	});

	const checkConnectionStatus = async () => {
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (tab && tab.id) {
				// Try to check if content script is loaded and signals are available
				try {
					await chrome.tabs.sendMessage(tab.id, { type: "PING" });
					status.value = {
						status: "connected",
						message: "Connected to active tab",
					};
				} catch {
					status.value = {
						status: "disconnected",
						message: "Content script not loaded",
					};
				}
			} else {
				status.value = {
					status: "disconnected",
					message: "No active tab found",
				};
			}
		} catch (error) {
			status.value = {
				status: "disconnected",
				message: "Unable to connect",
			};
		}
	};

	const openDevTools = async () => {
		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (tab && tab.id) {
				// The DevTools will be opened by the user, we can't programmatically open them
				// Instead, we'll send a message to highlight the Signals panel
				chrome.tabs
					.sendMessage(tab.id, { type: "HIGHLIGHT_SIGNALS_PANEL" })
					.catch(() => {
						// Ignore errors if content script isn't ready
					});

				// Close the popup
				window.close();
			}
		} catch (error) {
			console.error("Failed to open DevTools:", error);
		}
	};

	const refreshDetection = async () => {
		status.value = {
			status: "disconnected",
			message: "Refreshing...",
		};

		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (tab && tab.id) {
				// Reload the content script
				await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					files: ["content.js"],
				});

				// Check status again after a short delay
				setTimeout(() => {
					checkConnectionStatus();
				}, 1000);
			}
		} catch (error) {
			status.value = {
				status: "disconnected",
				message: "Failed to refresh",
			};
		}
	};

	useSignalEffect(() => {
		checkConnectionStatus();
	});

	return (
		<div>
			<div className="header">
				<h1>Preact Signals</h1>
				<p>DevTools Extension</p>
			</div>

			<StatusIndicator
				status={status.value.status}
				message={status.value.message}
			/>

			<div className="actions">
				<ActionButton onClick={openDevTools} className="btn primary">
					Open DevTools Panel
				</ActionButton>
				<ActionButton onClick={refreshDetection}>
					Refresh Detection
				</ActionButton>
			</div>

			<InfoSection />
		</div>
	);
}

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
	const container = document.getElementById("app");
	if (container) {
		render(<PopupApp />, container);
	}
});
