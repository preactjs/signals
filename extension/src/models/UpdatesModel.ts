import { signal, computed } from "@preact/signals";
import { Divider, SignalUpdate } from "../types";

const createUpdatesModel = () => {
	const updates = signal<(SignalUpdate | Divider)[]>([]);
	const lastUpdateId = signal<number>(0);

	const addUpdate = (
		update: SignalUpdate | Divider | Array<SignalUpdate | Divider>
	) => {
		if (Array.isArray(update)) {
			update.forEach(item => {
				if (item.type !== "divider") item.receivedAt = Date.now();
			});
		} else if (update.type === "update") {
			update.receivedAt = Date.now();
		}
		updates.value = [
			...updates.value,
			...(Array.isArray(update) ? update : [update]),
		];
	};

	const hasUpdates = computed(() => updates.value.length > 0);

	const signalCounts = computed(() => {
		const counts = new Map<string, number>();
		updates.value.forEach(update => {
			if (update.type === "divider") return;
			const signalName = update.signalName || "Unknown";
			counts.set(signalName, (counts.get(signalName) || 0) + 1);
		});
		return counts;
	});

	const clearUpdates = () => {
		updates.value = [];
		lastUpdateId.value = 0;
	};

	return {
		updates,
		signalCounts,
		addUpdate,
		clearUpdates,
		hasUpdates,
	};
};

export const updatesStore = createUpdatesModel();
