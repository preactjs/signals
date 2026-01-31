import { cloneElement, options } from "preact";

const didRender = new WeakSet();

interface VNode<P = any> extends preact.VNode<P> {
	__c?: preact.Component;
	__e?: Element | Text;
	__k: VNode[];
	__: VNode;
}

let globalEnabled = !/flash=(false|0|off)/.test(location + "");
let enabled = globalEnabled;
export function setFlashingEnabled(newEnabled: boolean) {
	enabled = globalEnabled && newEnabled;
}

let constrainedRoot: preact.Component;
export function constrainFlashingTo(root: preact.Component) {
	constrainedRoot = root;
}

export function constrainFlashToChildren<T extends any[]>(...children: T) {
	return children.flat(9).map(child => {
		return cloneElement(child, { ref: constrainFlashingTo });
	});
}

// @ts-ignore-next-line
let oldDiff = options.__b;
// @ts-ignore-next-line
options.__b = (vnode: VNode) => {
	if (oldDiff) oldDiff(vnode);
	didRender.delete(vnode);
};

// @ts-ignore-next-line
let oldRender = options.__r;
// @ts-ignore-next-line
options.__r = (vnode: VNode) => {
	if (oldRender) oldRender(vnode);
	didRender.add(vnode);
};

let oldDiffed = options.diffed;
options.diffed = (vnode: VNode) => {
	if (oldDiffed) oldDiffed(vnode);
	if (!didRender.delete(vnode) || !vnode.__c) return;
	if (enabled === false) return;

	if (constrainedRoot) {
		let v = vnode;
		let found = false;
		while ((v = v.__)) {
			if (v.__c === constrainedRoot) {
				found = true;
				break;
			}
		}
		if (!found) return;
	}

	const roots = findRoots(vnode);
	if (roots.length === 0) roots.push(vnode);
	flash(
		roots.map(v => v.__e),
		getName(vnode.type)
	);
};

// eslint-disable-next-line @typescript-eslint/ban-types
function getName(type: string | (Function & { displayName?: string })) {
	if (typeof type === "string") return type;
	return (type && (type.name || type.displayName)) || String(type);
}

function findRoots(vnode: VNode, roots: VNode[] = []) {
	let r = [];
	let has = false;
	if (!vnode) return roots;
	if (vnode.__k) {
		for (let child of vnode.__k) {
			if (!child) continue;
			if (child.__c || hasComponentChild(child)) {
				has = true;
			} else {
				r.push(child);
			}
		}
	}
	if (has) {
		roots.push(...r);
	} else if (vnode.__k) {
		for (let child of vnode.__k) {
			if (child && !child.__c) findRoots(child, roots);
		}
	}
	return roots;
}

function hasComponentChild(vnode: VNode): boolean {
	return (
		vnode.__k && vnode.__k.some(child => child && hasComponentChild(child))
	);
}

function flash(nodes: (Node | undefined)[], annotation?: string) {
	const scrollX = window.scrollX;
	const scrollY = window.scrollY;

	const range = new Range();
	for (let node of nodes) {
		if (!node) continue;
		const isElement = node.nodeType === 1;
		// @ts-ignore-next-line
		if (isElement && node.hasAttribute("data-flash-ignore")) continue;
		const color = isElement ? "rgba(150,100,255,.3)" : "rgba(50,200,100,.3)";
		range.selectNode(node);
		// const rects = range.getClientRects();
		const rects = [range.getBoundingClientRect()];
		for (const rect of rects) {
			let styled = document.createElement("x-flash");
			if (annotation) styled.textContent = annotation;
			styled.style.cssText = `position:absolute; border-radius:5px; pointer-events:none; font:12px/1.3 system-ui; display:inline-flex; align-items:center; justify-content:center; color:#fff; text-align:center;`;
			// styled.style.padding = "2px";
			// styled.style.margin = "-2px";
			styled.style.background = color;
			styled.style.boxShadow = `0 0 3px 3px ${color}`;
			styled.style.left = rect.left + scrollX + "px";
			styled.style.top = rect.top + scrollY + "px";
			styled.style.width = rect.width + "px";
			styled.style.height = rect.height + "px";
			document.documentElement.appendChild(styled);
			styled.animate({ opacity: 0 }, 500).finished.then(() => styled.remove());
		}
	}
}

// function flash(vnode) {
//   let el = vnode.__e;
//   if (!el) return;
//   if (el.nodeType === 3) {
//     let styled = document.createElement("x-flash");
//     styled.textContent = el.data;
//     el.replaceWith(styled);
//     const gcu = getComputedStyle(styled);
//     const { left, top, width, height } = styled.getBoundingClientRect();
//     styled.style.position = "absolute";
//     styled.style.font = gcu.font;
//     styled.style.color = gcu.color;
//     styled.style.lineHeight = gcu.lineHeight;
//     styled.style.left = left + "px";
//     styled.style.top = top + "px";
//     styled.style.width = width + "px";
//     styled.style.height = height + "px";
//     styled.replaceWith(el);
//     document.documentElement.appendChild(styled);
//     styled
//       .animate([{ background: "rgba(100,200,155,.5)" }, {}], 250)
//       .finished.then(() => styled.remove());
//   } else {
//     el.animate([{ background: "rgba(150,100,255,.5)" }, {}], 250);
//   }
// }
