// Wrapper for AdventureLand functions.
// @ts-check

const DEBUG = true;

/**
 * Is it possible to move directly to a position?
 *
 * @param {object|number} position_or_x position or x-coordinate.
 * @param {number} [y] y-coordinate (if position not provided).
 */
export function can_move_to(position_or_x, y) {
	return window.can_move_to(position_or_x, y);
}

/**
 * Move to position.
 *
 * @param {number} x x-coordinate
 * @param {number} y y-coordinate
 * @returns {Promise} Resolves when movement completes.
 */
export async function move(x, y) {
	let line = null;
	if (DEBUG) {
		line = window.draw_line(character.x, character.y, x, y);
	}

	const result = await window.move(x, y);

	if (line) {
		line.destroy();
	}

	return result;
}

/**
 * Move to a location using path-finding.
 *
 * @param {object|string} location Location to move to.
 * @returns {Promise} Resolves when movement complete.
 */
export async function smart_move(location) {
	return await window.smart_move(location);
}

/**
 * Change character's active target.
 *
 * @param {object} target New target.
 */
export function change_target(target) {
	if (!target) {
		return;
	}

	if (DEBUG) {
		let circle = window.draw_circle(target.x, target.y, target.range, null, 0xff0000);
		setTimeout(() => circle.destroy(), 500);
	}

	window.change_target(target);
}

/**
 * Fetch value from persistant storage.
 *
 * @param {string} name Key to identify value.
 * @returns {Object|Array|number|string|null} Stored value or `null` if value does not exist.
 */
export function get(name) {
	const value = window.get(name);
	console.debug(`Get ${name}`, value);

	return value;
}

/**
 * Store value in persistant storage.
 *
 * Object must be JSON serializable.
 *
 * @param {string} name Key to identify value.
 * @param {Object|Array|number|string|null} value Value to store.
 */
export function set(name, value) {
	console.debug(`Set ${name}`, value);
	window.set(name, value);
}

/**
 * Map code snippet to key.
 *
 * @param {string} key Key to map to.
 * @param {string} code Code snippet.
 */
export function map_snippet(key, code) {
	console.debug(`Mapping ${key} to snippet`, code);
	window.map_key(key, 'snippet', code);
}

/**
 * Map a key to a skill.
 *
 * @param {string} key Key to map to.
 * @param {string} skill Skill to set.
 * @param {string} [code] Optional code for skill.
 */
export function map_key(key, skill, code) {
	console.debug(`Mapping ${key}`, {skill: skill, code: code});
	window.map_key(key, skill, code);
}

/**
 * Stop your character.
 *
 * Cancels all channeling abilities and active skills.
 */
export function stop() {
	console.debug('Stopping character');
	window.stop();
}

/**
 * Respawn character.
 */
export function respawn() {
	console.debug('Respawning...');
	window.respawn();
}
