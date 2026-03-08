import { computed, createModel, signal } from "@preact/signals-core";

function formatTime() {
	return new Date().toLocaleTimeString();
}

export const WorkerCounterModel = createModel(() => {
	const count = signal(0, { name: "worker-count" });
	const ticking = signal(false, { name: "worker-ticking" });
	const updatedAt = signal(formatTime(), { name: "worker-updated-at" });
	const status = computed(
		() =>
			ticking.value
				? `Worker timer running - pushed count ${count.value}`
				: `Worker idle - last count ${count.value}`,
		{ name: "worker-status" }
	);

	let timer: ReturnType<typeof setInterval> | undefined;

	function stamp() {
		updatedAt.value = formatTime();
	}

	function setCount(next: number) {
		count.value = next;
		stamp();
	}

	return {
		count,
		ticking,
		updatedAt,
		status,
		increment() {
			setCount(count.value + 1);
		},
		decrement() {
			setCount(count.value - 1);
		},
		randomize() {
			setCount(Math.floor(Math.random() * 100));
		},
		start() {
			if (timer !== undefined) {
				return;
			}

			ticking.value = true;
			stamp();
			timer = setInterval(() => {
				count.value += 1;
				stamp();
			}, 1000);
		},
		stop() {
			if (timer === undefined) {
				return;
			}

			clearInterval(timer);
			timer = undefined;
			ticking.value = false;
			stamp();
		},
		reset() {
			this.stop();
			setCount(0);
		},
	};
});
