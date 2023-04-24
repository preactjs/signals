import sinon from "sinon";

/**
 * `console.log` supports formatting strings with `%s` for string substitutions.
 * This function accepts a string and additional arguments of values and returns
 * a string with the values substituted in.
 */
export function consoleFormat(str: string, ...values: unknown[]): string {
	let idx = 0;
	return str.replace(/%s/g, () => String(values[idx++]));
}

declare global {
	let errorSpy: sinon.SinonSpy | undefined;
}

// Only one spy can be active on an object at a time and since all tests share
// the same console object we need to make sure we're only spying on it once.
// We'll use this method to share the spy across all tests.
export function getConsoleErrorSpy(): sinon.SinonSpy {
	if (typeof errorSpy === "undefined") {
		(globalThis as any).errorSpy = sinon.spy(console, "error");
	}

	return errorSpy!;
}

const messagesToIgnore = [
	// Ignore errors for timeouts of tests that often happen while debugging
	/async tests and hooks,/,
	// Ignore React 16 warnings about awaiting `act` calls (warning removed in React 18)
	/Do not await the result of calling act/,
	// Ignore how chai or mocha uses `console.error` to print out errors
	/AssertionError/,
];

export function checkConsoleErrorLogs(): void {
	const errorSpy = getConsoleErrorSpy();
	if (errorSpy.called) {
		let message: string;
		if (errorSpy.firstCall.args[0].toString().includes("%s")) {
			const args = errorSpy.firstCall.args;
			message = consoleFormat(args[0], ...args.slice(1));
		} else {
			message = errorSpy.firstCall.args.join(" ");
		}

		if (messagesToIgnore.every(re => re.test(message) === false)) {
			expect.fail(
				`Console.error was unexpectedly called with this message: \n${message}`
			);
		}
	}
}
