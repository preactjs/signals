/* oxlint-disable */
// @ts-nocheck
// @vitest-environment jsdom

import * as signalsCore from "@preact/signals-core";
import { batch, signal } from "@preact/signals-core";
import * as signalsRuntime from "@preact/signals-react/runtime";
import * as React from "react";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { rolldown } from "rolldown";
import { transform as rolldownTransform } from "rolldown/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import reactSignalsTransform, {
	type ReactSignalsTransformPluginOptions,
} from "../../src/index.ts";

const customSource = "useSignals-custom-source";
const nodeRequire = createRequire(import.meta.url);
const disposeSymbol = Symbol.for("Symbol.dispose");
const disposableSignalsRuntime = {
	...signalsRuntime,
	useSignals(...args: unknown[]) {
		const value = signalsRuntime.useSignals(...args);
		if (
			value != null &&
			typeof value === "object" &&
			!(disposeSymbol in value) &&
			typeof value.f === "function"
		) {
			return {
				...value,
				[Symbol.dispose]() {
					value.f();
				},
				[disposeSymbol]() {
					value.f();
				},
			};
		}

		return value;
	},
};
const modules: Record<string, unknown> = {
	"@preact/signals-core": signalsCore,
	"@preact/signals-react/runtime": disposableSignalsRuntime,
	react: React,
	"react/jsx-dev-runtime": jsxDevRuntime,
	"react/jsx-runtime": jsxRuntime,
	[customSource]: disposableSignalsRuntime,
};

function testRequire(name: string): unknown {
	if (name in modules) {
		return modules[name];
	}

	return nodeRequire(name);
}

async function createComponent(
	code: string,
	options: ReactSignalsTransformPluginOptions = {},
	filename = "virtual:entry.tsx"
): Promise<Record<string, unknown>> {
	let sourceCode = code;
	if (/\busing\s+/.test(sourceCode)) {
		const transformed = await rolldownTransform(filename, sourceCode, {
			jsx: "preserve",
			lang: filename.endsWith(".tsx")
				? "tsx"
				: filename.endsWith(".ts")
					? "ts"
					: "jsx",
			sourceType: "module",
			target: "es2022",
		});
		sourceCode = transformed.code;
	}

	const build = await rolldown({
		input: filename,
		plugins: [
			{
				name: "virtual",
				resolveId(id) {
					if (id === filename) return id;
					return { id, external: true };
				},
				load(id) {
					if (id === filename) return sourceCode;
				},
			},
			reactSignalsTransform(options),
		],
	});

	const { output } = await build.generate({ format: "cjs" });
	await build.close();

	const generatedCode = output[0].code;

	const exports: Record<string, unknown> = {};
	const module = { exports };
	runInNewContext(generatedCode, {
		clearTimeout,
		console,
		exports,
		globalThis,
		module,
		process,
		require: testRequire,
		setTimeout,
	});
	return module.exports;
}

describe("react signals transform runtime", () => {
	let scratch: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	async function render(element: React.ReactElement) {
		await act(async () => {
			root.render(element);
		});
	}

	beforeEach(() => {
		globalThis.IS_REACT_ACT_ENVIRONMENT = true;
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
		root = createRoot(scratch);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		scratch.remove();
	});

	it("should rerender components when using signals as text", async () => {
		const { App } = await createComponent(`
      export function App({ name }) {
        return <div>Hello {name}</div>;
      }
    `);

		const name = signal("John");
		await render(React.createElement(App as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should rerender components when signals they use change", async () => {
		const { App } = await createComponent(`
      export function App({ name }) {
        return <div>Hello {name.value}</div>;
      }
    `);

		const name = signal("John");
		await render(React.createElement(App as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should rerender components with custom hooks that use signals", async () => {
		const { App, name } = await createComponent(`
      import { signal } from '@preact/signals-core';

      export const name = signal('John');
      function useName() {
        return name.value;
      }

      export function App() {
        const name = useName();
        return <div>Hello {name}</div>;
      }
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should rerender components with multiple custom hooks that use signals", async () => {
		const { App, name, greeting } = await createComponent(`
      import { signal } from '@preact/signals-core';

      export const greeting = signal('Hello');
      function useGreeting() {
        return greeting.value;
      }

      export const name = signal('John');
      function useName() {
        return name.value;
      }

      export function App() {
        const greeting = useGreeting();
        const name = useName();
        return <div>{greeting} {name}</div>;
      }
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).toBe("<div>Hi John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hi Jane</div>");

		await act(async () => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
			});
		});
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");
	});

	it("should rerender components that use signals with multiple custom hooks that use signals", async () => {
		const { App, name, greeting, punctuation } = await createComponent(`
      import { signal } from '@preact/signals-core';

      export const greeting = signal('Hello');
      function useGreeting() {
        return greeting.value;
      }

      export const name = signal('John');
      function useName() {
        return name.value;
      }

      export const punctuation = signal('!');
      export function App() {
        const greeting = useGreeting();
        const name = useName();
        return <div>{greeting} {name}{punctuation.value}</div>;
      }
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John!</div>");

		await act(async () => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).toBe("<div>Hi John!</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hi Jane!</div>");

		await act(async () => {
			punctuation.value = "?";
		});
		expect(scratch.innerHTML).toBe("<div>Hi Jane?</div>");

		await act(async () => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
				punctuation.value = "!";
			});
		});
		expect(scratch.innerHTML).toBe("<div>Hello John!</div>");
	});

	it("should rerender components wrapped in memo", async () => {
		const { MemoApp, name } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { memo } from 'react';

      export const name = signal('John');

      function App({ name }) {
        return <div>Hello {name.value}</div>;
      }

      export const MemoApp = memo(App);
    `);

		await render(React.createElement(MemoApp as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should rerender components wrapped in memo inline", async () => {
		const { MemoApp, name } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { memo } from 'react';

      export const name = signal('John');

      export const MemoApp = memo(({ name }) => {
        return <div>Hello {name.value}</div>;
      });
    `);

		await render(React.createElement(MemoApp as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should rerender components wrapped in forwardRef", async () => {
		const { ForwardRefApp, name } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { forwardRef } from 'react';

      export const name = signal('John');

      function App({ name }, ref) {
        return <div ref={ref}>Hello {name.value}</div>;
      }

      export const ForwardRefApp = forwardRef(App);
    `);

		const ref = React.createRef<HTMLDivElement>();
		await render(React.createElement(ForwardRefApp as any, { name, ref }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");
		expect(ref.current).toBe(scratch.firstChild);

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
		expect(ref.current).toBe(scratch.firstChild);
	});

	it("should rerender components wrapped in forwardRef inline", async () => {
		const { ForwardRefApp, name } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { forwardRef } from 'react';

      export const name = signal('John');

      export const ForwardRefApp = forwardRef(({ name }, ref) => {
        return <div ref={ref}>Hello {name.value}</div>;
      });
    `);

		const ref = React.createRef<HTMLDivElement>();
		await render(React.createElement(ForwardRefApp as any, { name, ref }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");
		expect(ref.current).toBe(scratch.firstChild);

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
		expect(ref.current).toBe(scratch.firstChild);
	});

	it("should rerender components wrapped in forwardRef with memo", async () => {
		const { MemoForwardRefApp, name } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { memo, forwardRef } from 'react';

      export const name = signal('John');

      export const MemoForwardRefApp = memo(forwardRef(({ name }, ref) => {
        return <div ref={ref}>Hello {name.value}</div>;
      }));
    `);

		const ref = React.createRef<HTMLDivElement>();
		await render(React.createElement(MemoForwardRefApp as any, { name, ref }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");
		expect(ref.current).toBe(scratch.firstChild);

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
		expect(ref.current).toBe(scratch.firstChild);
	});

	it("should rerender registry-style declared components", async () => {
		const { App, name, lang } = await createComponent(`
      import { signal } from '@preact/signals-core';
      import { memo } from 'react';

      const Greeting = {
        English: memo(({ name }) => <div>Hello {name.value}</div>),
        ['Espanol']: memo(({ name }) => <div>Hola {name.value}</div>),
      };

      export const name = signal('John');
      export const lang = signal('English');

      export function App() {
        const Component = Greeting[lang.value];
        return <Component name={name} />;
      }
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");

		await act(async () => {
			lang.value = "Espanol";
		});
		expect(scratch.innerHTML).toBe("<div>Hola Jane</div>");
	});

	it("should transform components authored inside a test body", async () => {
		const { name, App } = await createComponent(`
      import { signal } from '@preact/signals-core';

      export const name = signal('John');
      export let App;

      const it = (name, fn) => fn();

      it('should work', () => {
        App = () => {
          return <div>Hello {name.value}</div>;
        };
      });
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should work when an ambiguous function is manually transformed and used as a hook", async () => {
		const { App, greeting, name } = await createComponent(`
      import { signal } from '@preact/signals-core';

      export const greeting = signal('Hello');
      export const name = signal('John');

      /** @useSignals */
      function usename() {
        return name.value;
      }

      export function App() {
        const name = usename();
        return <div>{greeting.value} {name}</div>;
      }
    `);

		await render(React.createElement(App as any));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			greeting.value = "Hi";
		});
		expect(scratch.innerHTML).toBe("<div>Hi John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hi Jane</div>");

		await act(async () => {
			batch(() => {
				greeting.value = "Hello";
				name.value = "John";
			});
		});
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");
	});

	it("loads useSignals from a custom source", async () => {
		const { App } = await createComponent(
			`
        export function App({ name }) {
          return <div>Hello {name.value}</div>;
        }
      `,
			{ importSource: customSource }
		);

		const name = signal("John");
		await render(React.createElement(App as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("works with the using keyword", async () => {
		const { App } = await createComponent(
			`
        import { useSignals } from '@preact/signals-react/runtime';

        export function App({ name }) {
          using _ = useSignals();
          return <div>Hello {name.value}</div>;
        }
      `,
			{ mode: "manual" }
		);

		const name = signal("John");
		await render(React.createElement(App as any, { name }));
		expect(scratch.innerHTML).toBe("<div>Hello John</div>");

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe("<div>Hello Jane</div>");
	});

	it("should transform components created by Array.map that use signals", async () => {
		const { App } = await createComponent(`
      export function App({ name }) {
        const greetings = ['Hello', 'Goodbye'];

        const children = greetings.map((greeting) => <div key={greeting}>{greeting} {name.value}</div>);

        return <div>{children}</div>;
      }
    `);

		const name = signal("John");
		await render(React.createElement(App as any, { name }));
		expect(scratch.innerHTML).toBe(
			"<div><div>Hello John</div><div>Goodbye John</div></div>"
		);

		await act(async () => {
			name.value = "Jane";
		});
		expect(scratch.innerHTML).toBe(
			"<div><div>Hello Jane</div><div>Goodbye Jane</div></div>"
		);
	});
});
