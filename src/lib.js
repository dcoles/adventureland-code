// Common functions

const HP_REGEN = 50;
const MP_REGEN = 100;
const MIN_MP = 100;

/** Log error. */
export function error(status, err) {
	set_message(status, "red");
	safe_log(err.stack, "red");

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

    if (action && !is_on_cooldown("use_" + action)) {
        use_skill("regen_" + action);
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