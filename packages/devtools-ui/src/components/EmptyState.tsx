import { Button } from "./Button";

interface EmptyStateProps {
	onRefresh: () => void;
	title?: string;
	description?: string;
	buttonText?: string;
}

export function EmptyState({
	onRefresh,
	title = "No Signals Detected",
	description = "Make sure your application is using @preact/signals-debug package.",
	buttonText = "Refresh Detection",
}: EmptyStateProps) {
	return (
		<div className="empty-state">
			<div className="empty-state-content">
				<h2>{title}</h2>
				<p>{description}</p>
				<div className="empty-state-actions">
					<Button onClick={onRefresh} variant="primary">
						{buttonText}
					</Button>
				</div>
			</div>
		</div>
	);
}
