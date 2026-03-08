import type { RemoteModelContract } from "@preact/signals-remote";

import type { WorkerCounterModel } from "./shared";

export type WorkerCounterContract = RemoteModelContract<
	"worker-counter",
	WorkerCounterModel
>;
