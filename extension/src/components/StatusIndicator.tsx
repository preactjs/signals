interface StatusIndicatorProps {
	status: "connected" | "disconnected" | "connecting" | "warning";
	message: string;
	showIndicator?: boolean;
	className?: string;
}

export function StatusIndicator({
	status,
	message,
	showIndicator = true,
	className = "",
}: StatusIndicatorProps) {
	return (
		<div className={`connection-status ${status} ${className}`}>
			{showIndicator && <span className={`status-indicator ${status}`}></span>}
			<span className="status-text">{message}</span>
		</div>
	);
}
