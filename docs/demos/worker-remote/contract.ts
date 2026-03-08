import { defineRemoteModel } from "@preact/signals-remote";

import { WorkerCounterModel } from "./model";

export const workerCounterRemote = defineRemoteModel(
	"worker-counter",
	WorkerCounterModel
);
