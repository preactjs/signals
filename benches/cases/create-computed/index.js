import { signal, computed } from "@preact/signals-core";
import * as bench from "../measure";

const count = signal(0);
const double = computed(() => count.value * 2);

bench.start();

for (let i = 0; i < 20000000; i++) {
	count.value++;
	double.value;
}

bench.stop();
