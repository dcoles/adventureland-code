// Character namespace
// @ts-check

import * as Adventure from './adventure.js';
import * as Util from './util.js';
import * as Skills from './skills.js';

// Globals
let g_character = null;

/**
 * Get the singleton `Character` object.
 *
 * @returns {Character}
 */
export function get_character() {
	if (!g_character) {
		g_character = new Character();
	}
	return g_character;
}

/**
 * Your Character.
 */
class Character {
	constructor() {
		/** Character skills. */
		this.skills = {}

		// Register all valid skills
		for (let [skill_id, skill] of Object.entries(G.skills)) {
			if ((skill.type == "skill" || skill.type == "ability")
			&& (!skill.class || skill.class.includes(character.ctype))) {
				this.skills[skill_id] = Skills.get_skill(skill_id);
			}
		}
	}

	/**
	 * Change character's active target.
	 *
	 * @param {object|string} target New target.
	 */
	change_target(target) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		Adventure.change_target(target);
	}

	/**
	 * Get the current targeted monster.
	 *
	 * Returns `null` if not a monster or the target is dead.
	 */
	get_targeted_monster() {
		return window.get_targeted_monster();
	}

	/**
	 * Loot chests.
	 *
	 * If a string ID is provided, then loot a specific chest.
	 * If `true` is provided, have this character's commander loot instead.
	 *
	 * @param {string|boolean} [id_or_arg] What to loot.
	 */
	loot(id_or_arg) {
		window.loot(id_or_arg);
	}

	/** Are we dead? */
	is_dead() {
		return character.rip;
	}

	/** Are we fully healed? */
	is_fully_healed() {
		return character.hp == character.max_hp;
	}

	/** Are we fully charged? */
	is_fully_charged() {
		return character.mp == character.max_mp;
	}

	/**
	 * Is the character in range of target.
	 *
	 * @param {object|string} target Character or Monster.
	 * @param {string} [skill_id="attack"] Specific skill to check.
	 */
	is_in_range(target, skill_id) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		return window.is_in_range(target, skill_id);
	}

	/**
	 * Distance between the character and target.
	 *
	 * @param {object|string} target Target to measure distance to.
	 * @returns {number|null} Distance to target or `null` is target isn't on the map.
	 */
	distance_to(target) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		if (!target || character.in != target.in) {
			return null;
		}

		return this.distance(target.x, target.y);
	}

	/**
	 * Distance position is away from character.
	 *
	 * @param {number} x x-coordinate.
	 * @param {number} y y-coordinate.
	 * @returns {number} Distance in pixels.
	 */
	distance(x, y) {
		return Util.distance(character.x, character.y, x, y);
	}

	/**
	 * Move towards a target.
	 *
	 * @param {object|string} target Target to move towards.
	 * @param {number} distance Distance to move in pixels.
	 * @returns {Promise} Resolves when finished moving.
	 **/
	async move_towards(target, distance) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		if (!target) {
			return null;
		}

		// Grab coordinates, lest they change
		const [x1, y1] = [character.x, character.y];
		const [x2, y2] = [target.x, target.y];
		const theta = Math.atan2(y2 - y1, x2 - x1);
		const target_x = x1 + distance * Math.cos(theta);
		const target_y = y1 + distance * Math.sin(theta);

		if (window.can_move_to(target_x, target_y)) {
			return await Adventure.move(target_x, target_y);
		}

		// Try to find a spot we can move to
		//window.clear_drawings();
		for (let r = 50; r < 2 * Math.abs(distance); r *= 1.5) {
			//window.draw_circle(target_x, target_y, r);
			for (let n = 0; n < 8; n++) {
				// Pick a random angle
				const theta2 = Math.random() * 2 * Math.PI;
				const new_x = target_x + r * Math.cos(theta2);
				const new_y = target_y + r * Math.sin(theta2);

				//window.draw_line(target_x, target_y, new_x, new_y, null, 0x0000ff);
				if (window.can_move_to(new_x, new_y)
				&& Util.distance(character.x, character.y, new_x, new_y) > Math.abs(distance) / 2) {
					//window.draw_circle(new_x, new_y, 4, null, 0x00ff00);
					return await Adventure.move(new_x, new_y);
				} else {
					//window.draw_circle(new_x, new_y, 2, null, 0xff0000);
				}
			}
		}

		// Just try to move as much as possible
		return await Adventure.move(target_x, target_y);
	}

	/**
	 * Cancels channeling abilities or active skills.
	 *
	 * @param {string} [action='move'] Action to cancel.
	 */
	stop(action) {
		Adventure.stop(action);
	}

	/**
	 * Stop doing anything!
	 */
	stop_all() {
		Adventure.stop('move');
		Adventure.stop('town');
		Adventure.stop('revival');

		// Cancel all autouse/autocasts
		for (let [_, skill] of Object.entries(this.skills)) {
			skill.cancel_autouse();
		}
	}

	/**
	 * Try to move directly to position, otherwise use pathfinding.
	 *
	 * @param {number} x x-coordinate.
	 * @param {number} y y-coordinate.
	 * @param {string} [map] Map (default: current map).
	 * @returns {Promise} Resolves when movement is complete.
	 */
	async xmove(x, y, map) {
		map = map || character.map;
		if (character.map === map && Adventure.can_move_to(x, y)) {
			return Adventure.move(x, y);
		} else {
			return Adventure.smart_move({x: x, y: y, map: map});
		}
	}
}
