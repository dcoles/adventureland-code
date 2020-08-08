/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */
'use strict';

import {
	error,
	regen_hp_or_mp,
	move_towards,
	get_nearest_monster,
} from './lib.js';

const HEARTBEAT_INTERVAL_MS = 250;
const TARGET_MAX_HP_RATIO = 10.00;
const TARGET_MAX_ATTACK_RATIO = 0.80;
const TARGET_MIN_XP_RATIO = 0.0025;
const CRITICAL_HP_RATIO = 0.10;

/** What are valid monster types to attack? */
function valid_monster_types() {
	let valid = new Set();

	for (let [mtype, monster] of Object.entries(G.monsters)) {
		if (monster.hp > TARGET_MAX_HP_RATIO * character.hp) continue;
		if (monster.attack > TARGET_MAX_ATTACK_RATIO * character.attack) continue;
		if (monster.xp < TARGET_MIN_XP_RATIO * character.xp) continue;

		valid.add(mtype);
	}

	return valid;
}

function pick_target() {
	let target = get_targeted_monster();
	if (!target) {
		target = get_nearest_monster({
			valid: valid_monster_types(),
			path_check: true,
		});
	}

	return target;
}

/** Regular heartbeat */
function heartbeat() {
	regen_hp_or_mp();
	loot();

	if (character.hp < CRITICAL_HP_RATIO * character.max_hp) {
		set_message('Critical HP!')
		use_skill('use_town');
		return;
	}

	let target = pick_target();
	if (!target) {
		set_message('No Monsters');
		return;
	}

	change_target(target);
	if (!is_in_range(target)) {
		set_message('Advancing');
		move_towards(target);
	} else if (can_attack(target)) {
		set_message('Attacking');
		attack(target);
	}
}

/** Main function */
function main() {
	// Start heartbeat
	setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
}

// Run and log any uncaught errors
try {
	main();
} catch (err) {
	error('ERROR', err);
}
