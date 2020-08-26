// Common functions
// @ts-check

/**
 * Get nearest monster.
 *
 * @param {object} [criteria] Criteria for matching monster.
 * @param {Set} [criteria.valid] Set of valid monster types (default: All monsters)
 * @param {boolean} [criteria.min_xp] Minimum XP of monsters to target (default: `1`)
 * @param {boolean} [criteria.no_target] Monster must have no target.
 * @param {number} [criteria.min_difficulty] Minimum difficulty of monster.
 * @param {number} [criteria.max_difficulty] Maxium difficulty of monster.
 * @param {boolean} [criteria.path_check] Checks if the character can move to the target (default: `false`)
 */
export function get_nearest_monster(criteria) {
	criteria = criteria || {};
	let target = null;
	let target_distance = Infinity;
	const min_xp = criteria.min_xp || 1;  // don't kill puppies

	for (let [id, entity] of Object.entries(parent.entities)) {
		if (entity.type !== 'monster') continue;
		if (criteria.valid && !criteria.valid.has(entity.mtype)) continue;
		if (entity.xp < min_xp) continue;
		if (criteria.no_target && entity.target && entity.target != character.name) continue;
		if (criteria.path_check && !can_move_to(entity)) continue;

		const difficulty = target_difficulty(entity);
		if (criteria.min_difficulty && difficulty < criteria.min_difficulty) continue;
		if (criteria.max_difficulty && difficulty > criteria.max_difficulty) continue;

		const distance = parent.distance(character, entity);
		if (distance > target_distance) continue;

		target = entity;
		target_distance = distance;
	}

	return target;
}

/** Calculate time for target to move a certain distance
 *
 * @param {object} target Target to measure.
 * @param {number} distance Distance target will move.
 * @returns {number} Duration in milliseconds.
*/
export function movement_time(target, distance) {
	return distance / target.speed * 1000;
}

/**
 * Calculate the difficulty of a target.
 *
 * 0 is easy, 10 is impossibly hard.
 *
 * @param {object} target Target to calculate difficulty of
 * @returns {number} Difficulty score out of 10.
 */
export function target_difficulty(target) {
	const target_dps = Math.max(target.attack * target.frequency - 50, 0);
	const character_dps = character.attack * character.frequency;

	// How many seconds until someone would die?
	const t_target = target.hp / character_dps;
	const t_character = character.hp / target_dps;
	const t_end = Math.min(t_target, t_character);

	const target_damage = Math.min(character_dps * t_end, target.hp);
	const character_damage = Math.min(target_dps * t_end, character.hp);

	return 5 * (character_damage / character.hp) + 5 * (1 - (target_damage / target.hp));
}

/**
 * Print the location of an entity.
 *
 * @param {object} entity An entity with a position.
 * @param {number} entity.x x-coordinate (pixels).
 * @param {number} entity.y y-coordinate (pixels).
 * @param {string} [entity.in] Optional map.
 */
export function position_to_string(entity) {
	let s = `${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`;
	if (entity.in) {
		s += ` in ${entity.in}`;
	}

	return s;
}
