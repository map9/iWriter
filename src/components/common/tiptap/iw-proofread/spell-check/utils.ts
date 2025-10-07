import hash from 'object-hash'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce(func: (...args: any[]) => void, wait: number) {
	let timeout: NodeJS.Timeout | undefined;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return function(this: any, ...args: any[]) {
		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => {
			func.apply(this, args);
		}, wait);
	};
}

export function generateNodeKey(node: import('@tiptap/pm/model').Node): string {
	return hash({
		type: node.type.name,
		content: node.textContent
	})
}

export function generateErrorKey(error: import('./types').SpellError): string {
	const keyContent = `${error.offset}-${error.length}-${hash(error.word)}`;
	return keyContent
}
