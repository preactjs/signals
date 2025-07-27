import { useEffect, useRef } from "preact/hooks";
import { Divider, SignalUpdate } from "../types";
import { UpdateItem } from "./UpdateItem";

export function UpdatesContainer({
	updates,
	signalCounts,
}: {
	updates: (SignalUpdate | Divider)[];
	signalCounts: Map<string, number>;
}) {
	const updatesListRef = useRef<HTMLDivElement>(null);
	const recentUpdates = updates.slice(-50).reverse();

	useEffect(() => {
		if (updatesListRef.current) {
			updatesListRef.current.scrollTop = 0;
		}
	}, [updates]);

	return (
		<div className="updates-container">
			<div className="updates-header">
				<div className="updates-stats">
					<span>
						Updates:{" "}
						<strong>{updates.filter(x => x.type !== "divider").length}</strong>
					</span>
					<span>
						Signals: <strong>{signalCounts.size}</strong>
					</span>
				</div>
			</div>

			<div className="updates-list" ref={updatesListRef}>
				{recentUpdates.map((update, index) =>
					update.type === "divider" ? (
						index === recentUpdates.length - 1 ? null : (
							<div key={`${update.type}-${index}`} className="divider" />
						)
					) : (
						<div key={`${update.receivedAt}-${index}`}>
							<UpdateItem update={update} />
						</div>
					)
				)}
			</div>
		</div>
	);
}
