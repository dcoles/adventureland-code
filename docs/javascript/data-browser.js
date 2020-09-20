const MIN_EXPAND_DEPTH = 3;
const LARGE_OBJECT_SIZE = 50;

/**
 * Create HTML representation of data structure path.
 *
 * @param {Array<string>} path
 * @returns {Node}
 */
function createBreadcrumbs(path) {
	const element = document.createElement('span');
	const crumbs = [];
	for (let i = 0; i < path.length; i++) {
		crumbs.push(path[i]);

		const a = document.createElement('a');
		a.href = '#' + crumbs.join('.');
		a.textContent = path[i];

		append(element, i === 0 ? a : ['.', a]);
	}
	return element;
}

/**
 * Create HTML representation of a data structure.
 *
 * Approximately JSON, but hides large child objects.
 *
 * @param {Node} parent Node to append to.
 * @param {object} data Data element to render.
 * @param {Array<string>} path
 */
function appendDataElement(parent, data, path, indent) {
	indent = indent || 0;

	const current = getNested(data, path);
	if (typeof current !== 'object') {
		// Primitive type
		append(parent, JSON.stringify(current));
	} else if (Array.isArray(current)) {
		// Array
		append(parent, ['[', document.createElement('br')]);

		for (let p of Object.keys(current)) {
			const newPrefix = [...path, p];
			append(parent, '\t'.repeat(indent + 1));
			appendDataElement(parent, data, newPrefix, indent + 1);
			append(parent, [',', document.createElement('br')]);
		}

		append(parent, ['\t'.repeat(indent), ']']);
	} else {
		// Object
		append(parent, ['{', document.createElement('br')]);

		for (let [p, child] of Object.entries(current)) {
			const newPrefix = [...path, p];
			append(parent, '\t'.repeat(indent + 1));

			const keyElement = document.createElement('a');
			keyElement.href = '#' + encodeURIComponent(newPrefix.join('.'));
			keyElement.innerText = p;

			append(parent, [keyElement, ': ']);
			if (isObject(child) && (isLargeObject(child) || path.length < MIN_EXPAND_DEPTH)) {
				append(parent, '{\u2026}');
			} else {
				appendDataElement(parent, data, newPrefix, indent + 1)
			}

			append(parent, [',', document.createElement('br')]);
		}

		append(parent, ['\t'.repeat(indent), '}']);
	}
}

/**
 * Append text or HTML nodes to an existing element.
 *
 * If an array is passed, will recursively append elements.
 *
 * @param {Node} parent Element to append to.
 * @param {string | Array | Node} thing The thing to append.
 */
function append(parent, thing) {
	if (!thing) {
		return;
	}

	if (Array.isArray(thing)) {
		for (let t of thing) {
			append(parent, t);
		}
		return;
	}

	switch (typeof thing) {
		case 'string':
			parent.appendChild(document.createTextNode(thing));
			break;

		default:
			parent.appendChild(thing);
	}
}

/**
 * Get value from a nested object by list of keys.
 *
 * @param {object} object Object to navigate.
 * @param {Array<string>} path An array of object keys.
 */
function getNested(object, path) {
	let obj = object;
	for (let p of path) {
		obj = obj[p];
	}

	return obj;
}

/**
 * Does this appear to be a large object (many sub-keys).
 */
function isLargeObject(value) {
	if (!isObject(value)) {
		return false;
	}

	let n = 0;
	for (let val of Object.values(value)) {
		if (typeof val !== 'object') {
			continue;
		}

		n += Object.keys(val).length;
	}

	return n > LARGE_OBJECT_SIZE;
}

/**
 * Is this an object (and not an Array).
 */
function isObject(value) {
	return typeof value === 'object' && !Array.isArray(value);
}
