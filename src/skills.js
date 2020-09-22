// @ts-check

import * as Adventure from '/adventure.js';
import * as Logging from '/logging.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

const JIFFIE_MS = 250;  // A short period of time

// global variables
let g_skills = {};

/**
 * Get Skill by `skill_id`.
 *
 * @param {string} skill_id AdventureLand skill.
 * @returns {Skill} Wrapped skill.
*/
export function get_skill(skill_id) {
	if (!g_skills[skill_id]) {
		g_skills[skill_id] = new Skill(skill_id);
	}

	return g_skills[skill_id];
}

/**
 * A usable skill.
 */
class Skill {
	constructor(skill_id) {
		this.skill_id = skill_id;

		this.skill = G.skills[this.skill_id];
		if (!this.skill) {
			throw new TypeError(`Unknown skill ${skill_id}`);
		}

		this.share_skill_id = this.skill.share || this.skill_id;
		this.share_skill = G.skills[this.share_skill_id];
		this.cooldown_id = Skill.cooldown_id(this.skill_id);
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
		// Don't pass Character wrapper
		target = target && target.name === parent.character.name ? parent.character : target;
		if (this.skill_id === 'attack') {
			return await attack(target);
		} else if (this.skill_id === 'heal') {
			return await heal(target);
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
		if (!(this.cooldown_id in Skill.autouse)) {
			return false;
		}

		if (Skill.autouse[this.cooldown_id][0] !== this.skill_id) {
			return false;
		}

		return Skill.autouse[this.cooldown_id][1].is_running();
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
		await this._create_autouse_task(async (task) => {
			Logging.info(`Autousing ${this.skill.name}`);

			while (!task.is_cancelled()) {
				// Don't use `this.wait_until_ready()` as it cancels autouse
				await wait_until_ready(this.cooldown_id);

				// Is the autouse condition broken?
				if (condition && await condition(target) == false) {
					Logging.debug(`Condition ${condition} failed`, this);
					break;
				}

				// Has this autouse been deactivated?
				if (task.is_cancelled()) {
					break;
				}

				// They're dead
				// Sometimes skills don't tell you that the entity is gone
				if (target && (target.dead || target.rip)) {
					break;
				}

				try {
					await this.use(target, extra_args);
				} catch (e) {
					if (e.reason === 'not_found') {
						// Target has gone. Cancel autouse.
						break;
					}
					Logging.warn(`Autouse ${this.skill.name} failed`, e);
					// FIXME: Determine exactly when we can actually use the skill.
					await Util.sleep(500);
				}
			}
		});
	}

	/**
	 * Create autouse task.
	 *
	 * @param {Task.Async} async Async function that implements this task.
	 * @returns {Promise} Resolves when this task is complete.
	 */
	_create_autouse_task(async) {
		this.cancel_autouse();

		const task = Task.create(async);
		Skill.autouse[this.cooldown_id] = [this.skill_id, task];
		return task.result();
	}

	/**
	 * Cancel this autouse skill (or shared skills).
	 */
	cancel_autouse() {
		if (!(this.cooldown_id in Skill.autouse)) {
			return;
		}

		Skill.autouse[this.cooldown_id][1].cancel();
		delete Skill.autouse[this.cooldown_id];
	}

	toString() {
		return `[Skill ${this.skill_id}]`;
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
		// No cooldown
		return;
	}

	Logging.debug(`Sleeping until '${cooldown_id}' ready`, next_skill_at);
	await Util.sleep_until(parent.next_skill[cooldown_id]);
}

/** Active autouse skills */
Skill.autouse = {};
