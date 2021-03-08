// Wrapper for AdventureLand functions.
// @ts-check

/**
 * Get nearby entities.
 *
 * @returns {Record<string, AdventureLand.Entity>}
 */
export function get_entities() {
	return parent.entities;
}

/**
 * Get character by name, if character is nearby.
 *
 * @see https://adventure.land/docs/code/character/reference
 *
 * @param {string} name Character name.
 * @returns {object|null} Character object or null.
 */
export function get_player(name) {
	if (name === character.name) {
		return character;
	}

	for (let entity of Object.values(get_entities())) {
		if (entity.type === 'character' && entity.name === name) {
			return entity;
		}
	}

	return null;
}

/**
 * Access the `#maincode` namespace.
 *
 * @return {object} The `#maincode` `Window`.
 */
export function get_maincode() {
	if (window.character.bot) {
		return window.parent.parent.maincode.contentWindow;
	} else {
		return window;
	}
}

/**
 * Access character CODE namespace.
 *
 * @param {string} name Character name.
 */
export function get_character_code(name) {
	name = (name || window.character.name).toLowerCase();
	const top = window.character.bot ? window.parent.parent : window.parent;
	if (name === window.character.name.toLowerCase()) {
		// Us
		return window;
	} else if (name === top.maincode.contentWindow.character.name.toLowerCase()) {
		// Leader
		return top.maincode.contentWindow;
	} else {
		// Other bots
		const id = 'ichar' + name;
		if (!(id in top)) {
			throw new Error(`No such character: ${name}`);
		}
		return top[id].contentWindow.maincode.contentWindow;
	}
}

/**
 * Map code snippet to key.
 *
 * @param {string} key Key to map to.
 * @param {string} code Code snippet.
 */
export function map_snippet(key, code) {
	map_key(key, 'snippet', code);
}
