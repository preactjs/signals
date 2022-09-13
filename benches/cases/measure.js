let startTime = 0;

export function start() {
	startTime = performance.now();
}

export function stop() {
	const end = performance.now();
	const duration = end - startTime;

	const url = new URL(window.location.href);
	const test = url.pathname;

	let memory = 0;
	if ("gc" in window && "memory" in window) {
		window.gc();
		memory = performance.memory.usedJSHeapSize / 1e6;
	}

	// eslint-disable-next-line no-console
	console.log(
		`Time: %c${duration.toFixed(2)}ms ${
			memory > 0 ? `${memory}MB` : ""
		}%c- done`,
		"color:peachpuff",
		"color:inherit"
	);

	return fetch("/results", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ test, duration, memory }),
	});
}
