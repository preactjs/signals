import type { ReadonlySignal } from "@preact/signals-core";

export interface WorkerCounterModel {
	count: ReadonlySignal<number>;
	ticking: ReadonlySignal<boolean>;
	updatedAt: ReadonlySignal<string>;
	status: ReadonlySignal<string>;

	increment(): void;
	decrement(): void;
	randomize(): void;
	start(): void;
	stop(): void;
	reset(): void;
}
