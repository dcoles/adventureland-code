// @ts-check

import * as Adventure from './adventure.js';
import * as Logging from './logging.js';
import * as Util from './util.js';

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
		return Skill.autouse[this.cooldown_id];
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

			// Is the target out of range?
			if (target && !Adventure.is_in_range(target, this.skill_id)) {
				// FIXME: Come up with a better way to determine this
				await Util.sleep(500);
				continue;
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
		throw new TypeError(`Unknown cooldown skill: ${cooldown_id}`);
	}

	Logging.debug(`Sleeping until '${cooldown_id}' ready`, next_skill_at);
	await Util.sleep_until(parent.next_skill[cooldown_id]);
}

/** Active autouse skills */
Skill.autouse = {};

/** Aquire an active autouse for this skills cooldown slot. */
function acquire_autouse(skill, target, extra_args) {
	// Release previous autouse (if any)
	release_autouse(Skill.autouse[skill.cooldown_id]);

	// Create a new token
	const token = { skill: skill, target: target, extra_args: extra_args, active: true, created: Date.now() };
	Skill.autouse[skill.cooldown_id] = token;

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
		delete Skill.autouse[token.skill.cooldown_id];
	}
}

/** Is this the currently active autouse? */
function is_active_autouse(token) {
	return Skill.autouse[token.skill.cooldown_id] === token;
}
