// Common functions

const HP_REGEN = 50;
const MP_REGEN = 100;
const MIN_MP = 100;

/** Log error. */
export function error(status, err) {
	set_message(status, 'red');
	safe_log(err.stack, 'red');

	// Log in browser console
	console.log(status, err);
}

/** Try to regenerate health/mana if possible. */
export function regen_hp_or_mp() {
    let action = null;

    if (character.mp < MIN_MP) {
        action = 'mp';
    } else if (character.hp < character.max_hp - HP_REGEN) {
        action = 'hp';
    } else if (character.mp < character.max_mp - MP_REGEN) {
        action = 'mp';
    }

    if (action && !is_on_cooldown('use_' + action)) {
        use_skill('regen_' + action);
    }
}

/** Move towards a target. */
export function move_towards(target) {
	// Walk half the distance
	move(
		character.x + (target.x - character.x) / 2,
		character.y + (target.y - character.y) / 2
	);
}

/**
 * Get nearest monster.
 *
 * @param {object} args Additional options
 * @param {Set} args.valid Set of valid monster types (default: All monsters)
 * @param {boolean} args.path_check Checks if the character can move to the target
 */
export function get_nearest_monster(args) {
	let target = null;
	let target_distance = Infinity;

	for (let [id, entity] of Object.entries(parent.entities)) {
		if (entity.type !== 'monster') continue;
		if (args.valid && !args.valid.has(entity.mtype)) continue;
		if (args.path_check && !can_move_to(entity)) continue;

		const distance = parent.distance(character, entity);
		if (distance > target_distance) continue;

		target = entity;
		target_distance = distance;
	}

	return target;
}
