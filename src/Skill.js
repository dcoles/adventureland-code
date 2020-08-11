import * as logging from './logging.js';
import { sleep_until } from './util.js';

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

	/** Wait until this skill is ready to cast. */
	async wait_until_ready() {
		await Skill.wait_until_ready(this.cooldown_id);
	}

	/** Cast this skill. */
	async cast(target, extra_args) {
		logging.debug('Casting', this);
		return await use_skill(this.skill_id, target, extra_args);
	}

	/** Is this the active autocast skill? */
	is_autocast() {
		const token = Skill.autocasts[this.cooldown_id];
		return token && token.skill.skill_id === this.skill_id && token.active;
	}

	/** Autocast skill until condition is met. */
	async autocast(target, extra_args, condition) {
		if (this.is_autocast()) {
			// Already on
			return;
		}

		logging.info(`Autocasting ${this.skill.name}`);
		const token = acquire_autocast(this);

		do {
			await this.wait_until_ready();

			// Is the autocast condition broken?
			if (condition && await condition() == false) {
				logging.debug(`Condition ${condition} failed`, this);
				break;
			}

			// Has this autocast been deactivated?
			if (!token.active) {
				break;
			}

			await this.cast(target, extra_args);
		} while (true)

		release_autocast(token);
	}
}

/** Active autocast skills */
Skill.autocasts = {};

/** Aquire an active autocast for this skills cooldown slot. */
function acquire_autocast(skill) {
	// Release previous autocast (if any)
	release_autocast(Skill.autocasts[skill.cooldown_id]);

	// Create a new token
	const token = {skill: skill, active: true, created: Date.now()};
	Skill.autocasts[skill.cooldown_id] = token;

	return token;
}

/** Deactive and release this autocast. */
function release_autocast(token) {
	if (!token) {
		return;
	}

	// Deactivate autocast
	token.active = false;

	// Remove this autocast if it's the active one
	if (is_active_autocast(token)) {
		delete Skill.autocasts[token.skill.cooldown_id];
	}
}

/** Is this the currently active autocast? */
function is_active_autocast(token) {
	return Skill.autocasts[token.skill.cooldown_id] === token;
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
