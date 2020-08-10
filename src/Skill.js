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
		logging.debug(this.skill_id);

		this.share_skill_id = this.skill.share || this.skill_id;
		this.share_skill = G.skills[this.share_skill_id];
	}

	/** Wait until skill is off cooldown */
	static async wait_until_ready(skill_id) {
		await sleep(JIFFIE_MS);  // FIXME: next_skill doesn't immediately update
		const next_skill_at = parent.next_skill[skill_id];
		if (!next_skill_at) {
			throw new TypeError(`Unknown cooldown skill: ${skill_id}`);
		}

		logging.debug(`Sleeping until '${skill_id}' ready`, next_skill_at);
		await sleep_until(parent.next_skill[skill_id]);
	}

	/** Wait until this skill is ready to cast. */
	async wait_until_ready() {
		await Skill.wait_until_ready(this.share_skill_id);
	}

	/** Cast this skill. */
	async cast(target, extra_args) {
		logging.debug('Casting', this);
		return await use_skill(this.skill_id, target, extra_args);
	}

	/** Is this the active autocast skill? */
	get is_active_autocast() {
		return this === Skill.autocasts[this.share_skill_id];
	}

	/** Autocast skill until condition is met. */
	async autocast(target, extra_args, condition) {
		const this_ = this;  // bind `this`
		async function cast_condition() {
			await this_.wait_until_ready();

			if (condition && await condition() === false) {
				logging.debug(`Condition ${condition} failed`, this_);
				return false;
			}

			if (!this_.is_active_autocast) {
				// No longer active autocast
				return false;
			}

			return true;
		}

		if (this.is_active_autocast) {
			// Already on
			logging.debug('Autocast already active', { data: this });
			return;
		}

		logging.info(`Autocasting ${this.skill.name}`);
		Skill.autocasts[this.share_skill_id] = this;

		while (await cast_condition()) {
			await this.cast(target, extra_args);
		}

		if (this.is_active_autocast) {
			delete Skill.autocasts[this.share_skill_id];
		}
	}
}

/** Active autocast skills */
Skill.autocasts = {};
