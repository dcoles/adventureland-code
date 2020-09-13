// Wrapper for AdventureLand functions.
// @ts-check
import * as Util from '/util.js';

const TRACE = false;
const IDLE_MS = 250;

/**
 * Is `target` in range of this skill?
 *
 * @param {object} target Target of skill.
 * @param {string} skill_id Code ID of skill.
 * @returns {boolean}
 */
export function is_in_range(target, skill_id) {
	return window.is_in_range(target, skill_id);
}

/**
 * Is this skill on cooldown?
 *
 * @param {string} skill_id Code ID of skill.
 * @returns {boolean}
 */
export function is_on_cooldown(skill_id) {
	return window.is_on_cooldown(skill_id);
}

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
	return await window.move(x, y);
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

export async function transport(map, spawn) {
	window.transport(map, spawn);

	// Wait for transport to complete
	// FIXME: Allow waiting on transport
	do {
		await Util.sleep(IDLE_MS);
	} while (character.map !== map);
}

/**
 * Change character's active target.
 *
 * @param {object} target New target.
 */
export function change_target(target) {
	return window.change_target(target);
}

/**
 * Fetch value from persistant storage.
 *
 * @param {string} name Key to identify value.
 * @returns {Object|Array|number|string|null} Stored value or `null` if value does not exist.
 */
export function get(name) {
	const value = window.get(name);
	TRACE && console.debug(`Get ${name}`, value);

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
	TRACE && console.debug(`Set ${name}`, value);
	window.set(name, value);
}

/**
 * Map code snippet to key.
 *
 * @param {string} key Key to map to.
 * @param {string} code Code snippet.
 */
export function map_snippet(key, code) {
	TRACE && console.debug(`Mapping ${key} to snippet`, code);
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
	TRACE && console.debug(`Mapping ${key}`, {skill: skill, code: code});
	window.map_key(key, skill, code);
}

/**
 * Cancels channeling abilities or active skills.
 *
 * @param {string} [action='move'] Action to cancel.
 * @param {*} [second] ???
 */
export function stop(action, second) {
	TRACE && console.debug(`Stopping ${action || 'move'}`);
	try {
		window.stop(action, second)
	} catch (e) {
		// Workaround `stop("move")` throwing error when character is dead
		window.log(`Failed to stop ${action}: ${e.reason}`);
	}
}

/**
 * Respawn character.
 */
export function respawn() {
	TRACE && console.debug('Respawning...');
	window.respawn();
}

/**
 * Get your character.
 *
 * @see https://adventure.land/docs/code/character/reference.
 *
 * @returns {object} Character object.
 */
export function get_character() {
	return window.character;
}

/**
 * Get your party members.
 *
 * @returns {object} Party object.
 */
export function get_party() {
	return window.get_party();
}

/**
 * Get details about all of our characters.
 *
 * @returns {Array} Array of character details.
 */
export function get_characters() {
	return window.get_characters();
}

/**
 * Get nearby entities.
 *
 * @returns {object} Mapping of entity ID to entity object.
 */
export function get_entities() {
	return window.parent.entities;
}

/**
 * Send party invite.
 *
 * @param {string} name Name of the character to invite.
 */
export function send_party_invite(name) {
	window.send_party_invite(name);
}

/**
 * Accept party invite.
 *
 * @param {string} name Name of the character who sent the invitation.
 */
export function accept_party_invite(name) {
	window.accept_party_invite(name);
}

/**
 * Send party request.
 *
 * @param {string} name Name of the character to request to party with.
 */
export function send_party_request(name) {
	window.send_party_request(name);
}

/**
 * Accept party request.
 *
 * @param {string} name Name of the character who sent the request.
 */
export function accept_party_request(name) {
	window.accept_party_request(name);
}

/**
 * Get the width of an entity.
 *
 * Note: This function is not in the docs, but used by other
 * documented functions like `distance`.
 *
 * @param {object} entity An entity with dimensions.
 * @returns {number} Width in pixels.
 */
export function get_width(entity) {
	return window.get_width(entity);
}

/**
 * Get the height of an entity.
 *
 * Note: This function is not in the docs, but used by other
 * documented functions like `distance`.
 *
 * @param {object} entity An entity with dimensions.
 * @returns {number} Height in pixels
 */
export function get_height(entity) {
	return window.get_height(entity);
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
	const character = get_character();
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
 * Start a character as a bot.
 *
 * @param {string} name
 * @param {number|string} slot_or_name
 */
export function start_character(name, slot_or_name) {
	window.start_character(name, slot_or_name);
}

/**
 * Stop running a character as a bot.
 *
 * @param {string} name
 */
export function stop_character(name) {
	window.stop_character(name);
}
