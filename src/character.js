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

/** Are we dead? */
export function is_dead() {
	return character.rip;
}

/** Are we fully healed? */
export function is_fully_healed() {
	return character.hp == character.max_hp;
}

/** Are we fully charged? */
export function is_fully_charged() {
	return character.mp == character.max_mp;
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
 * Distance between the character and target.
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

	return distance(target.x, target.y);
}

/**
 * Distance position is away from character.
 *
 * @param {number} x x-coordinate.
 * @param {number} y y-coordinate.
 * @returns {number} Distance in pixels.
 */
export function distance(x, y) {
	return Util.distance(character.x, character.y, x, y);
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
 * Cancels channeling abilities or active skills.
 *
 * @param {string} [action='move'] Action to cancel.
 */
export function stop(action) {
	Adventure.stop(action);
}

/**
 * Stop doing anything!
 */
export function stop_all() {
	Adventure.stop('move');
	Adventure.stop('town');
	Adventure.stop('revival');

	// Cancel all autouse/autocasts
	for (let [_, token] of Object.entries(SkillWrapper.autouse)) {
		token.active = false;
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

	/** Can we use this skill? */
	is_usable(target) {
		if (target && !this.is_in_range(target)) {
			// Not in range
			return false;
		}

		if (!this.is_sufficent_mana()) {
			// Not enough MP
			return false;
		}

		return !this.is_on_cooldown();
	}

	/**
	 * Is `target` in range of this skill?
	 *
	 * @param {object} target Target of skill.
	 * @returns {boolean}
	 */
	is_in_range(target) {
		return Adventure.is_in_range(target, this.skill_id);
	}

	/**
	 * Is there sufficent mana to use this skill?
	 *
	 * @returns {boolean}
	 */
	is_sufficent_mana() {
		return character.mp >= this.skill.mp
	}

	/**
	 * Is this skill on cooldown?
	 *
	 * @returns {boolean}
	 */
	is_on_cooldown() {
		return Adventure.is_on_cooldown(this.skill_id);
	}

	/**
	 * Use this skill as soon as it's ready.
	 *
	 * @param {object} [target] Target of skill (if required).
	 * @param {object} [extra_args] Extra args for skill.
	 */
	async use_when_ready(target, extra_args) {
		await this.wait_until_ready();
		return await this.use(target, extra_args);
	}

	/**
	 * Wait until skill is off cooldown.
	 *
	 * If this skill is being autoused, then it will be cancelled to prevent
	 * deadlock from occuring.
	 */
	async wait_until_ready() {
		this.cancel_autouse();
		await wait_until_ready(this.cooldown_id);
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
			const result = await use_skill(this.skill_id, target, extra_args);
			// FIXME: Workaround for use-skill not returning a Promise
			await Util.sleep(JIFFIE_MS);
			return result;
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
			// Don't use `this.wait_until_ready()` as it cancels autouse
			await wait_until_ready(this.cooldown_id);

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
					// Target has gone. Cancel autouse.
					break;
				}
				Logging.warn(`Autouse ${this.skill.name} failed`, e.reason);
				// FIXME: Determine exactly when we can actually use the skill.
				await Util.sleep(500);
			}
		} while (true)

		release_autouse(token);
	}

	/**
	 * Cancel this autouse skill (or shared skills).
	 */
	cancel_autouse() {
		const token = this.get_token();
		if (!token) {
			return;
		}

		Logging.debug(`Canceling autouse of ${token.skill.skill_id}`);
		release_autouse(this.get_token());
	}
}

/**
 * Wait until off cooldown.
 *
 * @param {string} cooldown_id Skill cooldown ID.
*/
async function wait_until_ready(cooldown_id) {
	// FIXME: next_skill doesn't immediately update
	await Util.sleep(JIFFIE_MS);

	const next_skill_at = parent.next_skill[cooldown_id];
	if (!next_skill_at) {
		throw new TypeError(`Unknown cooldown skill: ${cooldown_id}`);
	}

	Logging.debug(`Sleeping until '${cooldown_id}' ready`, next_skill_at);
	await Util.sleep_until(parent.next_skill[cooldown_id]);
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
