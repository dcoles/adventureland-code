// Common functions
// @ts-check

const ORIGIN = { x: 0, y: 0 };
const TOWN_RADIUS = 600;  // px

/**
 * Is the target in Town?
 *
 * @param {object} [target=character] Target to check.
 * @returns {boolean} `true` if the target is in town, otherwise `false`.
 **/
export function is_in_town(target) {
	target = target || character;
	if (target.in != 'main') {
		// Wrong map
		return false;
	}
	return distance(target, ORIGIN) < TOWN_RADIUS;
}

/**
 * Get nearest monster.
 *
 * @param {object} [criteria] Criteria for matching monster.
 * @param {Set} [criteria.valid] Set of valid monster types (default: All monsters)
 * @param {boolean} [criteria.min_xp] Minimum XP of monsters to target (default: `1`)
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
		if (criteria.path_check && !can_move_to(entity)) continue;

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
