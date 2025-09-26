export function debounce(func: (...args: any[]) => void, wait: number) {
	let timeout: NodeJS.Timeout | undefined;

	return function(this: any, ...args: any[]) {
		if (timeout) {
			clearTimeout(timeout);
		}

		timeout = setTimeout(() => {
			func.apply(this, args);
		}, wait);
	};
}

export function createSpellCheckEnabledStore(getInitialValue: () => boolean) {
    let spellCheckEnabled = getInitialValue();
    const subscribers = new Set<(value: boolean) => void>();

    function subscribe(subscriber: (value: boolean) => void) {
        subscribers.add(subscriber);
        subscriber(spellCheckEnabled);

        return () => subscribers.delete(subscriber);
    }

    function set(newValue: boolean) {
        if (spellCheckEnabled !== newValue) {
            spellCheckEnabled = newValue;
            subscribers.forEach(subscriber => subscriber(spellCheckEnabled));
        }
    }

    function get() {
        return spellCheckEnabled;
    }

    return {
        subscribe,
        set,
        get
    };
}