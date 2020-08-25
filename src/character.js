// Character namespace
// @ts-check

import * as Adventure from './adventure.js';
import * as Logging from './logging.js';
import * as Util from './util.js';

const JIFFIE_MS = 250;  // A short period of time

/**
 * Change character's active target.
 *
 * @param {object|string} target New target.
 */
export function change_target(target) {
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
export function get_targeted_monster() {
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
export function loot(id_or_arg) {
	window.loot(id_or_arg);
}

/**
 * Is the character in range of target.
 *
 * @param {object|string} target Character or Monster.
 * @param {string} [skill_id="attack"] Specific skill to check.
 */
export function is_in_range(target, skill_id) {
	if (target instanceof String) {
		target = get_entity(target);
	}

	return window.is_in_range(target, skill_id);
}

/**
 * Get the distance between the character and target.
 *
 * @param {object|string} target Target to measure distance to.
 * @returns {number|null} Distance to target or `null` is target isn't on the map.
 */
export function distance_to(target) {
	if (target instanceof String) {
		target = get_entity(target);
	}

	if (!target || character.in != target.in) {
		return null;
	}

	return Util.distance(character.x, character.y, target.x, target.y);
}

/**
 * Move towards a target.
 *
 * @param {object|string} target Target to move towards.
 * @param {number} distance Distance to move in pixels.
 * @returns {Promise} Resolves when finished moving.
 **/
export async function move_towards(target, distance) {
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
				return await Adventure.move(new_x, new_y);
			}
		}
	}

	// Just try to move as much as possible
	return await Adventure.move(target_x, target_y);
}

/**
 * Try to move directly to position, otherwise use pathfinding.
 *
 * @param {number} x x-coordinate.
 * @param {number} y y-coordinate.
 * @param {string} [map] Map (default: current map).
 * @returns {Promise} Resolves when movement is complete.
 */
export async function xmove(x, y, map) {
	map = map || character.map;
	if (character.map === map && Adventure.can_move_to(x, y)) {
		return Adventure.move(x, y);
	} else {
		return Adventure.smart_move({x: x, y: y, map: map});
	}
}

/**
 * A usable skill.
 */
class SkillWrapper {
	constructor(skill_id) {
		this.skill_id = skill_id;

		this.skill = G.skills[this.skill_id];
		if (!this.skill) {
			throw new TypeError(`Unknown skill ${skill_id}`);
		}

		this.share_skill_id = this.skill.share || this.skill_id;
		this.share_skill = G.skills[this.share_skill_id];
		this.cooldown_id = SkillWrapper.cooldown_id(this.skill_id);
	}

	/**
	 * Cooldown used by a particular skill.
	 *
	 * @param {string} skill_id The Skill ID.
	 * @returns {string}
	 */
	static cooldown_id(skill_id) {
		const share_skill_id = G.skills[skill_id].share || skill_id;

		switch (share_skill_id) {
			case 'use_hp':
			case 'use_mp':
				// Same cooldown timer
				return 'use_hp';

			default:
				return share_skill_id;
		}
	}

	/** Skill name. */
	get name() {
		return this.skill.name;
	}

	/** Explanation of skill. */
	get explanation() {
		return this.skill.explanation;
	}

	/** Minimum level requirement to use this skill. */
	get level() {
		return this.skill.level || 0;
	}

	/** MP required to use this skill. */
	get mp() {
		return this.skill.mp || 0;
	}

	/** Wait until skill is off cooldown. */
	async wait_until_ready() {
		await Util.sleep(JIFFIE_MS);  // FIXME: next_skill doesn't immediately update
		const next_skill_at = parent.next_skill[this.cooldown_id];
		if (!next_skill_at) {
			throw new TypeError(`Unknown cooldown skill: ${this.cooldown_id}`);
		}

		Logging.debug(`Sleeping until '${this.cooldown_id}' ready`, next_skill_at);
		await Util.sleep_until(parent.next_skill[this.cooldown_id]);
	}

	/**
	 * Use this skill.
	 *
	 * @param {object} [target] Target of skill (if required).
	 * @param {object} [extra_args] Extra args for skill.
	 */
	async use(target, extra_args) {
		Logging.debug('Using skill', this.skill_id);
		if (this.skill_id == 'attack') {
			return await attack(target);
		} else {
			return await use_skill(this.skill_id, target, extra_args);
		}
	}

	/**
	 * Is this skill currently being auto-used?
	 *
	 * @returns {boolean}
	 */
	is_autouse() {
		const token = this.get_token();
		return token && token.skill.skill_id === this.skill_id && token.active;
	}

	/**
	 * @returns {object|null} Current autouse token or null.
	 */
	get_token() {
		return SkillWrapper.autouse[this.cooldown_id];
	}

	/**
	 * Auto-use this skill.
	 *
	 * This skill will be used every time it is ready and `condition` resolves.
	 * If `condition` returns `False`, then autouse will deactivate.
	 *
	 * @param {object} [target] Target of skill (if required).
	 * @param {object} [extra_args] Extra args for skill.
	 * @param {Function} [condition] Condition for casting the skill.
	 */
	async autouse(target, extra_args, condition) {
		const old_token = this.get_token()
		if (this.is_autouse()
		&& old_token.target == target && old_token.extra_args == extra_args) {
			// Already on
			return;
		}

		Logging.info(`Autousing ${this.skill.name}`);
		const token = acquire_autouse(this, target, extra_args);

		do {
			await this.wait_until_ready();

			// Is the autouse condition broken?
			if (condition && await condition() == false) {
				Logging.debug(`Condition ${condition} failed`, this);
				break;
			}

			// Has this autouse been deactivated?
			if (!token.active) {
				break;
			}

			try {
				await this.use(target, extra_args);
			} catch (e) {
				if (e.reason == 'not_found') {
					break;
				}
				if (e.reason == 'too_far') {
					// FIXME: Wait until target is in range/gone
					await Util.sleep(500);
					continue;
				}
				Logging.warn(`Autouse ${this.skill.name} failed`, e.reason);
			}
		} while (true)

		release_autouse(token);
	}
}

/** Active autouse skills */
SkillWrapper.autouse = {};

/** Aquire an active autouse for this skills cooldown slot. */
function acquire_autouse(skill, target, extra_args) {
	// Release previous autouse (if any)
	release_autouse(SkillWrapper.autouse[skill.cooldown_id]);

	// Create a new token
	const token = { skill: skill, target: target, extra_args: extra_args, active: true, created: Date.now() };
	SkillWrapper.autouse[skill.cooldown_id] = token;

	return token;
}

/** Deactive and release this autouse. */
function release_autouse(token) {
	if (!token) {
		return;
	}

	// Deactivate autouse
	token.active = false;

	// Remove this autouse if it's the active one
	if (is_active_autouse(token)) {
		delete SkillWrapper.autouse[token.skill.cooldown_id];
	}
}

/** Is this the currently active autouse? */
function is_active_autouse(token) {
	return SkillWrapper.autouse[token.skill.cooldown_id] === token;
}

/** Character skills. */
export let skills = {}

// Register all valid skills
for (let [skill_id, skill] of Object.entries(G.skills)) {
	if ((skill.type == "skill" || skill.type == "ability")
	&& (!skill.class || skill.class.includes(character.ctype))) {
		skills[skill_id] = new SkillWrapper(skill_id);
	}
}
