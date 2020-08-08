/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */
"use strict";

import {
	error,
	regen_hp_or_mp,
	move_towards,
} from './lib.js';

const HEARTBEAT_INTERVAL = 250;  // ms

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

/** Regular heartbeat */
function heartbeat() {
	regen_hp_or_mp();
	loot();

	let target = pick_target();

	if (!is_in_range(target)) {
		move_towards(target);
	} else if (can_attack(target)) {
		set_message("Attacking");
		attack(target);
	}
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
