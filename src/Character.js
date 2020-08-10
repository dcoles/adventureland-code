import { Skill } from './Skill.js';

export class Character {
	constructor(char) {
		this.character = char || character;
		this.skills = {};

		this.add_skill(new Skill('regen_hp'));
		this.add_skill(new Skill('regen_mp'));
	}

	add_skill(skill) {
		if (!skill instanceof Skill) {
			throw new TypeError(`Expected Skill got ${typeof skill}`);
		}
		this.skills[skill.skill_id] = skill;
	}
}
