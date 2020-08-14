// @ts-check

/**
 * Character namespace.
 *
 * Most of these are just re-exports of runner functions.
 */
export var Character = {
	get_target: get_target,
	get_targeted_monster: get_targeted_monster,
	loot: loot,
};


/**
 * Change character's active target.
 *
 * @param {object|string} target New target.
 */
Character.change_target = function (target) {
	if (target instanceof String) {
		target = get_entity(target);
	}

	change_target(target);
}

/**
 * Is the character in range of target.
 *
 * @param {object|string} target Character or Monster.
 * @param {string} [skill_id="attack"] Specific skill to check.
 */
Character.is_in_range = function (target, skill_id) {
	if (target instanceof String) {
		target = get_entity(target);
	}

	return is_in_range(target, skill_id);
}

/**
 * Get the distance between the character and target.
 *
 * @param {object|string} target Target to measure distance to.
 * @param {boolean} [in_check=false] If `true`, ensure `target` is on the same map.
 */
Character.distance = function (target, in_check) {
	if (target instanceof String) {
		target = get_entity(target);
	}

	return distance(character, target, in_check);
}

/**
 * Move towards a target.
 *
 * @param {object} target Target to move towards.
 **/
Character.move_towards = async function (target) {
	// Walk half the distance (or until in range)
	const dist = distance(character, target);
	const dx = (target.x - character.x) / dist;
	const dy = (target.y - character.y) / dist;

	const movement_dist = Math.min(dist / 2, dist - character.range);
	await move(character.x + movement_dist * dx, character.y + movement_dist * dy);
}

/**
 * Move directly away from target.
 *
 * @param {object} target Target to retreat from.
 * @param {number} retreat_dist Distance to retreat (in pixels).
 */
Character.retreat_from = async function (target, retreat_dist) {
	// Calculate unit-vector
	const dist = distance(character, target);
	const dx = (character.x - target.x) / dist;
	const dy = (character.y - target.y) / dist;

	// Retreat `retreat_dist` directly away
	await move(character.x + retreat_dist * dx, character.y + retreat_dist * dy);
}
