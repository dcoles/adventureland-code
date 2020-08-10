/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */
'use strict';

import * as logging from './logging.js';
import {
	move_towards,
	get_nearest_monster,
	is_in_town,
	retreat,
} from './lib.js';
import { sleep } from './util.js';
import { Character } from './Character.js';
import { Skill } from './Skill.js';
import { BattleLog } from './BattleLog.js';

const IDLE_MS = 250;
const TARGET_MAX_HP_RATIO = 10.00;
const TARGET_MAX_ATTACK_RATIO = 0.80;
const TARGET_MIN_XP_RATIO = 0.01;
const TARGET_RETREAT_DISTANCE = 30;
const CRITICAL_HP_RATIO = 0.10;
const MAX_MOVEMENT_DISTANCE = 100;

const STOP = 'Stop';
const IDLE = 'Idle';
const ADVANCE = 'Advance';
const ATTACK = 'Attack';
const RETREAT = 'Retreat';
const FLEE_TO_TOWN = 'Flee to Town';

/** Current behaviour */
let state = STOP;

/** Update current state */
function update_state(new_state) {
	if (new_state === state) {
		return;
	}

	set_message(new_state);
	logging.info('New state', new_state);
	state = new_state;
}

/** Critical error */
export function critical(text, obj) {
	set_message('ERROR', 'red');
	state = STOP;
	logging.error(text, obj);
}

/** What are valid monster types to attack? */
function valid_monster_types() {
	let valid = new Set();

	for (let [mtype, monster] of Object.entries(G.monsters)) {
		if (monster.hp > TARGET_MAX_HP_RATIO * character.hp) continue;
		if (monster.attack > TARGET_MAX_ATTACK_RATIO * character.attack) continue;

		valid.add(mtype);
	}

	return valid;
}

/** Pick a target to attack */
function pick_target() {
	let target = get_targeted_monster();
	if (target) {
		// Already targetting a monster
		return target;
	}

	return get_nearest_monster({
		valid: valid_monster_types(),
		min_xp: TARGET_MIN_XP_RATIO * character.max_xp,
		path_check: true,
	});
}

/** Are we at critically low HP? */
function is_hp_critically_low() {
	return character.hp < CRITICAL_HP_RATIO * character.max_hp;
}

/** Main loop */
async function mainloop() {
	let target;
	do {
		// Always do these actions
		loot();

		// Emergency maneuvers
		if (is_hp_critically_low() && !is_in_town()) {
			update_state(FLEE_TO_TOWN);
		}

		target = get_target();
		switch (state) {
			case STOP:
				// Do nothing
				await sleep(IDLE_MS);
				break;

			case IDLE:
				await sleep(IDLE_MS);

				// Pick a new target
				target = pick_target();
				if (target) {
					logging.info('Target', target);
					change_target(target);
					update_state(ADVANCE);
				} else {
					update_state(IDLE);
				}
				break;

		case ADVANCE:
			if (!target) {
				update_state(IDLE);
				break;
			}

			await move_towards(target);
			if (is_in_range(target)) {
				update_state(ATTACK);
			}

			break;

		case ATTACK:
			if (!target) {
				update_state(IDLE);
				break;
			}

			await Skill.wait_until_ready('attack');

			if (!is_in_range(target)) {
				update_state(ADVANCE);
			}

			attack(target);

			if (distance(character, target) < TARGET_RETREAT_DISTANCE) {
				update_state(RETREAT);
				break;
			}

			break;

		case RETREAT:
			if (!target) {
				update_state(IDLE);
				return;
			}

			const dist = distance(character, target);
			if (dist >= character.range) {
				update_state(IDLE);
				return;
			}

			await retreat(target, Math.min(character.range, MAX_MOVEMENT_DISTANCE));

			update_state(ATTACK);
			break;

		case FLEE_TO_TOWN:
			if (is_in_town()) {
				update_state(IDLE);
				break;
			}

			if (target) {
				await retreat(target, character.range);
			}

			await Skill.wait_until_ready('use_town');
			use_skill('use_town');

			break;

		default:
			critical('Unhandled state', state);
			return;
		}

		// Slow down the loop for safety
		await sleep(100);
	} while (true)
}

/** Main function */
function main() {
	log('Starting code');

	BattleLog.monitor();

	const char = new Character();
	char.skills.regen_hp.autocast();

	update_state(IDLE);

	// Log all events
	game.all((name, data) => {
		//console.log('EVENT:', name, data);
	});

	// Run event loop
	mainloop().catch((err) => {
		throw err;
	})
}

// Run and log any uncaught errors
try {
	main();
} catch (err) {
	critical('Unhandled exception', err);
}
