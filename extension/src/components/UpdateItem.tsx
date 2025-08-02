import { SignalUpdate } from "../types";

interface UpdateItemProps {
	update: SignalUpdate;
}

export function UpdateItem({ update }: UpdateItemProps) {
	const time = new Date(
		update.timestamp || update.receivedAt
	).toLocaleTimeString();
	const depth = "  ".repeat(update.depth || 0);

	const formatValue = (value: any): string => {
		if (value === null) return "null";
		if (value === undefined) return "undefined";
		if (typeof value === "string") return `"${value}"`;
		if (typeof value === "function") return "function()";
		if (typeof value === "object") {
			try {
				return JSON.stringify(value, null, 0);
			} catch {
				return "[Object]";
			}
		}
		return String(value);
	};

	if (update.type === "effect") {
		return (
			<div
				style={{ marginLeft: `${(update.depth || 0) * 4}px` }}
				className={`update-item ${update.type}`}
			>
				<div className="update-header">
					<span className="signal-name">
						{depth}↪️ {update.signalName}
					</span>
					<span className="update-time">{time}</span>
				</div>
			</div>
		);
	}

	const prevValue = formatValue(update.prevValue);
	const newValue = formatValue(update.newValue);

	return (
		<div
			style={{ marginLeft: `${(update.depth || 0) * 4}px` }}
			className={`update-item ${update.type}`}
		>
			<div className="update-header">
				<span className="signal-name">
					{depth}
					{update.depth === 0 ? "🎯" : "↪️"} {update.signalName}
				</span>
				<span className="update-time">{time}</span>
			</div>
			<div className="value-change">
				<span className="value-prev">{prevValue}</span>
				<span className="value-arrow">→</span>
				<span className="value-new">{newValue}</span>
			</div>
		</div>
	);
}
