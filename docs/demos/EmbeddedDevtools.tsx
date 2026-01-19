import { useEffect, useRef } from "preact/hooks";
import { mount } from "@preact/signals-devtools-ui";
import "@preact/signals-devtools-ui/styles";
import { createDirectAdapter } from "@preact/signals-devtools-adapter";
import "./devtools.css";

export function EmbeddedDevTools() {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const adapter = createDirectAdapter();

		let cleanup: (() => void) | null = null;

		mount({
			adapter,
			container: containerRef.current,
			hideHeader: false,
			initialTab: "updates",
		}).then((unmount: () => void) => {
			cleanup = unmount;
		});

		return () => {
			if (cleanup) cleanup();
		};
	}, []);

	return (
		<div
			style="min-height: 600px; background: white;"
			ref={containerRef}
			class="devtools-panel"
		/>
	);
}
