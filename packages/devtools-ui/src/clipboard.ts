export function copyToClipboard(text: string): void {
	const copyElement = document.createElement("textarea");
	try {
		copyElement.value = text;
		document.body.append(copyElement);
		copyElement.select();
		document.execCommand("copy");
	} finally {
		copyElement.remove();
	}
}
