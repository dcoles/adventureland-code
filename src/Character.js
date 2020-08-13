// @ts-check

import { Skill } from './Skill.js';

export class Character {
	/**
	 * Create a new Character wrapping a `character` object.
	 *
	 * @param {object} [char=character] A character to wrap.
	 */
	constructor(char) {
		this.character = char || character;
		this.skills = {};

		this.add_skill(new Skill('regen_hp'));
		this.add_skill(new Skill('regen_mp'));
	}

	/**
	 * Add character Skill.
	 *
	 * @param {Skill} skill Skill object.
	 */
	add_skill(skill) {
		if (!(skill instanceof Skill)) {
			throw new TypeError(`Expected Skill got ${typeof skill}`);
		}
		this.skills[skill.skill_id] = skill;
	}
}
