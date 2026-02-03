import type { SignalUpdate } from "../context";

interface UpdateItemProps {
	update: SignalUpdate;
	firstUpdate?: SignalUpdate;
	count?: number;
}

export function UpdateItem({ update, count, firstUpdate }: UpdateItemProps) {
	const time = new Date(
		update.timestamp || update.receivedAt
	).toLocaleTimeString();

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
	const countLabel = count && (
		<span class="update-count" title="Number of grouped identical updates">
			x{count}
		</span>
	);

	if (update.type === "effect" || update.type === "component") {
		const icon = update.type === "component" ? "🔄" : "↪️";
		const label = update.type === "component" ? "Component render" : "Effect";
		return (
			<div className={`update-item ${update.type}`}>
				<div className="update-header">
					<span className="signal-name">
						{icon} {update.signalName}
						{countLabel}
					</span>
					<span className="update-type-badge">{label}</span>
					<span className="update-time">{time}</span>
				</div>
			</div>
		);
	}

	const prevValue = formatValue(update.prevValue);
	const newValue = formatValue(update.newValue);
	const firstValue =
		firstUpdate !== undefined ? formatValue(firstUpdate.prevValue) : undefined;

	return (
		<div class={`update-item ${update.type}`}>
			<div class="update-header">
				<span class="signal-name">
					{update.depth === 0 ? "🎯" : "↪️"} {update.signalName}
					{countLabel}
				</span>
				<span class="update-time">{time}</span>
			</div>
			<div class="value-change">
				{firstValue && firstValue !== prevValue && (
					<>
						<span class="value-prev">{firstValue}</span>
						<span class="value-arrow">...</span>
					</>
				)}
				<span class="value-prev">{prevValue}</span>
				<span class="value-arrow">→</span>
				<span class="value-new">{newValue}</span>
			</div>
		</div>
	);
}
