import {
	useModel,
	useSignal,
	useComputed,
	useSignalEffect,
} from "@preact/signals";
import { signal, computed, effect, untracked } from "@preact/signals-core";
import { Model } from "./model";

export const Linting = () => {
	const sig = useSignal(0);
	const model = useModel(Model);

	signal(0);
	effect(() => {});
	computed(() => {});

	// @ts-ignore - we are not using bar, just want to test the linting
	const bar = useComputed(() => {
		// Both should complain about these
		model.count.value = 5;
		sig.value = 6;
		return "foo";
	});

	useSignalEffect(() => {
		const perform = async () => {
			await new Promise(resolve => setTimeout(resolve, 100));
			// Both should complain about these
			// @ts-ignore - we are not using count, just want to test the linting
			const count = model.count.value;
			// @ts-ignore - we are not using sigValue, just want to test the linting
			const sigValue = sig.value;

			// Should not complain about this
			sig.value++;
			// Should not complain about this
			sig.value = 10;
		};

		perform();
	});

	// Issue #621: .value after a non-reactive guard (.peek / plain variable)
	// should warn because the signal won't be tracked as a dependency.
	useSignalEffect(() => {
		const id = model.count.peek();
		if (!id) return;
		// Both should complain about this — .value after non-reactive guard
		console.log(sig.value);
	});

	// .value after a .value guard is OK — the guard signal IS tracked
	useSignalEffect(() => {
		if (!model.count.value) return;
		// Should NOT complain — model.count is tracked by the guard above
		console.log(sig.value);
	});

	// untracked() guard — .value inside untracked is non-reactive, like .peek()
	useSignalEffect(() => {
		if (!untracked(() => model.count.value)) return;
		// Should complain — untracked guard is non-reactive
		console.log(sig.value);
	});

	// ESLint should complain about this, oxlint not
	if (model.count) return <p>Lint error</p>;
	// Both should complain about this
	if (sig) return <p>Lint error</p>;
};
