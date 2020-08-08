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
	is_in_town,
	retreat,
} from './lib.js';

const HEARTBEAT_INTERVAL_MS = 250;
const TARGET_MAX_HP_RATIO = 10.00;
const TARGET_MAX_ATTACK_RATIO = 0.80;
const TARGET_MIN_XP_RATIO = 0.01;
const CRITICAL_HP_RATIO = 0.10;
const TARGET_MIN_DISTANCE = 30;

const IDLE = 'Idle';
const FIND_TARGET = 'Find target';
const ADVANCE = 'Advance';
const ATTACK = 'Attack';
const RETREAT = 'Retreat';
const FLEE_TO_TOWN = 'Flee to Town';

/** Current behaviour */
let state = IDLE;

/** What are valid monster types to attack? */
function valid_monster_types() {
	let valid = new Set();

	for (let [mtype, monster] of Object.entries(G.monsters)) {
		if (monster.hp > TARGET_MAX_HP_RATIO * character.hp) continue;
		if (monster.attack > TARGET_MAX_ATTACK_RATIO * character.attack) continue;
		if (monster.xp < TARGET_MIN_XP_RATIO * character.max_xp) continue;

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

/** Update current state */
function update_state(new_state) {
	set_message(new_state);
	state = new_state;
}

/** Calculate critical HP */
function critical_hp() {
	return CRITICAL_HP_RATIO * character.max_hp;
}

/** Regular heartbeat */
function heartbeat() {
	set_message(state);

	// Always do these actions
	regen_hp_or_mp();
	loot();

	// Emergency actions
	if (character.hp < critical_hp()
			&& !is_in_town(character)
			&& state !== FLEE_TO_TOWN) {
		log('HP is critically low!', 'orange');
		update_state(FLEE_TO_TOWN);
	}

	let target = get_target();
	switch (state) {
		case IDLE:
			update_state(IDLE);
			// fallthrough

		case FIND_TARGET:
			update_state(FIND_TARGET);

			target = pick_target();
			change_target(target);

			if (!target) {
				update_state(IDLE);
				return;
			}

			// fallthrough

		case ADVANCE:
			update_state(ADVANCE);

			if (!target) {
				update_state(IDLE);
				return;
			}

			if (!is_in_range(target)) {
				move_towards(target);
				return;
			}

			// fallthrough

		case ATTACK:
			update_state(ATTACK);

			if (!target) {
				update_state(IDLE);
				return;
			}

			if (distance(character, target) < TARGET_MIN_DISTANCE) {
				// Too close!
				update_state(RETREAT);
				return;
			}

			if (is_on_cooldown('attack')) {
				// Wait...
				return;
			}

			attack(target);
			break;

		case RETREAT:
			update_state(RETREAT);

			if (!target) {
				update_state(IDLE);
				return;
			}

			const dist = distance(character, target);
			if (dist >= TARGET_MIN_DISTANCE) {
				update_state(IDLE);
				return;
			}

			retreat(target, TARGET_MIN_DISTANCE * 1.5);
			update_state(ATTACK);
			break;

		case FLEE_TO_TOWN:
			update_state(FLEE_TO_TOWN);

			if (is_in_town(character)) {
				update_state(IDLE);
				return;
			}

			if (target) {
				retreat(target, TARGET_MIN_DISTANCE * 2);
			}

			use_skill('use_town');
			break;
	
		default:
			log('Unknown state: ' + state, 'red');
			update_state(IDLE);
			break;
	}
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
