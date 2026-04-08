const defaultRegex = '(?=[\\u00BF-\\u1FFF\\u2C00-\\uD7FF]|\\b|\\s)(?![0-9])(?![。，！、》…）)}"】\\.\\,\\!\\?\\]\\:])';

const languageWordWrapMap: Record<string, string> = {
	Vietnamese: '?![ẮẰẲẴẶĂẤẦẨẪẬÂÁÀÃẢẠĐẾỀỂỄỆÊÉÈẺẼẸÍÌỈĨỊỐỒỔỖỘÔỚỜỞỠỢƠÓÒÕỎỌỨỪỬỮỰƯÚÙỦŨỤÝỲỶỸỴA-Z]',
};

const usingWordWrap: string[] = [];

let splitRegex: RegExp;

function updateRegex(): void {
	let pattern = defaultRegex;
	for (const key of usingWordWrap) {
		if (languageWordWrapMap[key]) {
			pattern += '(' + languageWordWrapMap[key] + ')';
		}
	}
	splitRegex = new RegExp(pattern, 'i');
}

updateRegex();

/**
 * Adds a language-specific word wrap regex pattern and enables it.
 * If the key already exists, the pattern is replaced.
 * If no pattern is provided, enables an existing key.
 */
export function addLanguageWordWrapRegex(languageKey: string, pattern?: string): void {
	if (pattern !== undefined) {
		languageWordWrapMap[languageKey] = pattern;
	}
	if (!usingWordWrap.includes(languageKey) && languageWordWrapMap[languageKey]) {
		usingWordWrap.push(languageKey);
	}
	updateRegex();
}

/** Returns all registered language keys. */
export function getAllSupportLanguageWordWrap(): string[] {
	return Object.keys(languageWordWrapMap);
}

/** Returns currently active language keys. */
export function getUsingWordWrap(): string[] {
	return [...usingWordWrap];
}

/** Disables a language-specific word wrap regex. */
export function cancelLanguageWordWrapRegex(languageKey: string): void {
	const index = usingWordWrap.indexOf(languageKey);
	if (index > -1) usingWordWrap.splice(index, 1);
	updateRegex();
}

/** Returns the current compiled word wrap split regex. */
export function getWordWrapRegex(): RegExp {
	return splitRegex;
}
