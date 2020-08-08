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
const TARGET_MIN_XP_RATIO = 0.003;
const CRITICAL_HP_RATIO = 0.10;

const IDLE = 'Idle';
const FIND_TARGET = 'Finding target';
const ADVANCE = 'Advancing';
const ATTACK = 'Attacking';
const FLEE_TO_TOWN = 'Fleeing to Town';

/** Current behaviour */
let state = IDLE;

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

/** Calculate critical HP */
function critical_hp() {
	return CRITICAL_HP_RATIO * character.hp;
}

/** Regular heartbeat */
function heartbeat() {
	// Always do these actions
	regen_hp_or_mp();
	loot();

	if (character.hp < critical_hp()) {
		state = FLEE_TO_TOWN;
	}

	let target = get_target();
	switch (state) {
		case IDLE:
			// fallthrough

		case FIND_TARGET:
			target = pick_target();
			change_target(target);

			if (!target) {
				state = IDLE;
				return;
			}

			// fallthrough

		case ADVANCE:
			if (!target) {
				state = IDLE;
				return;
			}

			if (!is_in_range(target)) {
				move_towards(target);
				return;
			}

			// fallthrough

		case ATTACK:
			if (is_on_cooldown('attack')) {
				// Wait...
				return;
			}

			attack(target);
			break;

		case FLEE_TO_TOWN:
			use_skill('use_town');
			break;
	
		default:
			log('Unknown state: ' + state, 'red');
			state = IDLE;
			break;
	}

	set_message(state);
}

/** Main function */
function main() {
	log('Starting...');

	// Start heartbeat
	setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
}

// Run and log any uncaught errors
try {
	main();
} catch (err) {
	error('ERROR', err);
}
