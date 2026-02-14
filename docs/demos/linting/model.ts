import { createModel, signal } from "@preact/signals-core";

export const Model = createModel(() => {
	const count = signal(0);

	return { count };
});
