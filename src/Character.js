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
