// @ts-check

import * as logging from './logging.js';
import { sleep, sleep_until } from './util.js';

const JIFFIE_MS = 250;  // A short period of time

/**
 * A usable skill.
 */
export class Skill {
	constructor(skill_id) {
		this.skill_id = skill_id;

		this.skill = G.skills[this.skill_id];
		if (!this.skill) {
			throw new TypeError(`Unknown skill ${skill_id}`);
		}

		this.share_skill_id = this.skill.share || this.skill_id;
		this.share_skill = G.skills[this.share_skill_id];
		this.cooldown_id = skill_cooldown_id(this.skill_id);
	}

	/** Wait until skill is off cooldown */
	static async wait_until_ready(cooldown_id) {
		await sleep(JIFFIE_MS);  // FIXME: next_skill doesn't immediately update
		const next_skill_at = parent.next_skill[cooldown_id];
		if (!next_skill_at) {
			throw new TypeError(`Unknown cooldown skill: ${cooldown_id}`);
		}

		logging.debug(`Sleeping until '${cooldown_id}' ready`, next_skill_at);
		await sleep_until(parent.next_skill[cooldown_id]);
	}

	/** Wait until this skill is ready to use. */
	async wait_until_ready() {
		await Skill.wait_until_ready(this.cooldown_id);
	}

	/**
	 * Use this skill.
	 * 
	 * @param {object} [target] Target of skill (if required).
	 * @param {object} [extra_args] Extra args for skill.
	 */
	async use(target, extra_args) {
		logging.debug('Using', this);
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
		const token = Skill.autouses[this.cooldown_id];
		return token && token.skill.skill_id === this.skill_id && token.active;
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
		if (this.is_autouse()) {
			// Already on
			return;
		}

		logging.info(`Autousing ${this.skill.name}`);
		const token = acquire_autouse(this);

		do {
			await this.wait_until_ready();

			// Is the autouse condition broken?
			if (condition && await condition() == false) {
				logging.debug(`Condition ${condition} failed`, this);
				break;
			}

			// Has this autouse been deactivated?
			if (!token.active) {
				break;
			}

			await this.use(target, extra_args);
		} while (true)

		release_autouse(token);
	}
}

/** Active autouse skills */
Skill.autouses = {};

/** Aquire an active autouse for this skills cooldown slot. */
function acquire_autouse(skill) {
	// Release previous autouse (if any)
	release_autouse(Skill.autouses[skill.cooldown_id]);

	// Create a new token
	const token = {skill: skill, active: true, created: Date.now()};
	Skill.autouses[skill.cooldown_id] = token;

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
		delete Skill.autouses[token.skill.cooldown_id];
	}
}

/** Is this the currently active autouse? */
function is_active_autouse(token) {
	return Skill.autouses[token.skill.cooldown_id] === token;
}

/** The cooldown used by a certain skill. */
function skill_cooldown_id(skill_id) {
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
