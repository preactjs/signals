import { render } from "preact";
import type { DevToolsAdapter } from "@preact/signals-devtools-adapter";
import { DevToolsPanel } from "./DevToolsPanel";
import { initDevTools, destroyDevTools } from "./context";

// TODO: Figure out how to inline CSS
// Transform CSS for shadow DOM (scoped at build time)
const SHADOW_DOM_STYLES = (inlineFile("./styles.css") as string)
	.replace(/^\*\s*\{/gm, ":host, :host * {")
	.replace(/^body\s*\{/gm, ":host {")
	.replace(/#app\s*\{/g, ".signals-devtools {");

export { SHADOW_DOM_STYLES as DEVTOOLS_STYLES };

export class SignalsDevToolsElement extends HTMLElement {
	private _shadowRoot: ShadowRoot;
	private _container: HTMLDivElement;
	private _adapter: DevToolsAdapter | null = null;
	private _cleanup: (() => void) | null = null;

	static get observedAttributes() {
		return ["hide-header", "initial-tab"];
	}

	constructor() {
		super();
		this._shadowRoot = this.attachShadow({ mode: "open" });
		this._injectStyles();
		this._container = document.createElement("div");
		this._container.className = "signals-devtools-root";
		this._shadowRoot.appendChild(this._container);
	}

	private _injectStyles(): void {
		const shadowRoot = this._shadowRoot as ShadowRoot & {
			adoptedStyleSheets?: CSSStyleSheet[];
		};
		if (shadowRoot.adoptedStyleSheets !== undefined) {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(SHADOW_DOM_STYLES);
			shadowRoot.adoptedStyleSheets = [sheet];
		} else {
			const style = document.createElement("style");
			style.textContent = SHADOW_DOM_STYLES;
			this._shadowRoot.appendChild(style);
		}
	}

	get adapter() {
		return this._adapter;
	}
	set adapter(value: DevToolsAdapter | null) {
		this._adapter = value;
		if (this.isConnected && value) this._mount();
	}

	get hideHeader() {
		return this.hasAttribute("hide-header");
	}
	get initialTab(): "updates" | "graph" {
		return this.getAttribute("initial-tab") === "graph" ? "graph" : "updates";
	}

	connectedCallback() {
		if (this._adapter) this._mount();
	}
	disconnectedCallback() {
		this._unmount();
	}

	private async _mount() {
		if (!this._adapter) return;
		this._unmount();
		initDevTools(this._adapter);
		await this._adapter.connect();
		render(
			<DevToolsPanel
				hideHeader={this.hideHeader}
				initialTab={this.initialTab}
			/>,
			this._container
		);
		this._cleanup = () => {
			render(null, this._container);
			destroyDevTools();
		};
	}

	private _unmount() {
		this._cleanup?.();
		this._cleanup = null;
	}
}

export function registerDevToolsElement(tagName = "signals-devtools") {
	if (!customElements.get(tagName)) {
		customElements.define(tagName, SignalsDevToolsElement);
	}
}
