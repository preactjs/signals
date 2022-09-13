import { signal, computed } from "./framework.js";

const count = signal(0);
const double = computed(() => count.value * 2);

console.time("core");

for (let i = 0; i < 20000000; i++) {
	count.value++;
	double.value;
}

console.timeEnd("core");
