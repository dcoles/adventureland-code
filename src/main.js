/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */
"use strict";

const HP_REGEN = 50;
const MP_REGEN = 100;
const HEARTBEAT_INTERVAL = 250;  // ms

const attack_mode = true;

/** Try to regenerate health/mana if possible. */
function regen_hp_or_mp() {
	if (!is_on_cooldown("use_hp")
		&& character.hp < character.max_hp - HP_REGEN) {
		use_skill("regen_hp");
	} else if (!is_on_cooldown("use_mp")
		&& character.mp < character.max_mp - MP_REGEN) {
		use_skill("regen_mp");
	}
}

function pick_target() {
	let target = get_targeted_monster();
	if (!target) {
		target = get_nearest_monster({
			min_xp: 100,
			max_att: 120
		});

		if (target) {
			change_target(target);
		} else {
			set_message("No Monsters");
			return;
		}
	}

	return target;
}

function move_towards(target) {
	// Walk half the distance
	move(
		character.x + (target.x - character.x) / 2,
		character.y + (target.y - character.y) / 2
	);
}

/** Regular heartbeat */
function heartbeat() {
	use_hp_or_mp();
	regen_hp_or_mp();
	loot();

	//if(!attack_mode || character.rip || is_moving(character)) return;
	let target = pick_target();

	if (!is_in_range(target)) {
		move_towards(target);
	} else if (can_attack(target)) {
		set_message("Attacking");
		attack(target);
	}
}

/** Log error */
function error(status, err) {
	set_message(status, "red");
	safe_log(err.stack, "red");

	// Log in browser console
	console.log(status, err);
}

/** Main function */
function main() {
	// Start heartbeat
	setInterval(heartbeat, HEARTBEAT_INTERVAL);
}

// Run and log any uncaught errors
try {
	main();
} catch (err) {
	error("ERROR", err);
}
