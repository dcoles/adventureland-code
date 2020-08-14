// Main entrypoint.
// @ts-check

/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */

'use strict';

import * as logging from './logging.js';
import {
	get_nearest_monster,
	is_in_town,
} from './lib.js';
import { sleep } from './util.js';
import { Character } from './Character.js';
import { Skill } from './Skill.js';
import { BattleLog } from './BattleLog.js';

const IDLE_MS = 250;
const TARGET_MAX_HP_RATIO = 10.00;
const TARGET_MAX_ATTACK_RATIO = 0.80;
const TARGET_RETREAT_DISTANCE = 30;

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
	let target = Character.get_targeted_monster();
	if (target) {
		// Already targetting a monster
		return target;
	}

	if (is_hp_low()) {
		// HP too low for combat
		return null;
	}

	target = get_nearest_monster({
		valid: valid_monster_types(),
		//min_xp: TARGET_MIN_XP_RATIO * character.max_xp,
		path_check: true,
	});

	return target;
}

/** Are we at critically low HP? */
function is_hp_critically_low() {
	// Below 10%
	return character.hp < character.max_hp / 10;
}

/** Are we at critically low MP? */
function is_mp_critically_low() {
	// Below 10%
	return character.mp < character.max_mp / 10;
}

/** Are we at low HP? */
function is_hp_low() {
	// Below 50%
	return character.hp < 0.90 * character.max_hp;
}

/** Main loop */
async function mainloop() {
	character.on('hit', (data) => {
		// Focus on attacker
		if (data.damage > 0) {
			const attacker = get_entity(data.actor);
			logging.info('Attacked by', attacker.name);
			Character.change_target(attacker);
		}
	});

	let i = 0;
	do {
		logging.debug(`tick ${i++}`, state);

		// Always loot
		Character.loot();

		if (is_hp_critically_low()) {
			// Emergency maneuvers
			Skill.regen_hp.autouse();
			if (!is_in_town()) {
				update_state(FLEE_TO_TOWN);
			}
		} else if (is_mp_critically_low()) {
			// Need some mana to cast!
			Skill.regen_mp.autouse();
		} else if (character.hp < character.max_hp) {
			// Restore HP
			Skill.regen_hp.autouse();
		} else if (character.mp < character.max_mp) {
			// Restore MP
			Skill.regen_mp.autouse();
		}

		const target = pick_target();
		switch (state) {
			case STOP:
				// Do nothing
				await sleep(IDLE_MS);
				break;

			case IDLE:
				await sleep(IDLE_MS);

				// Pick a new target
				if (target) {
					Character.change_target(target);
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

			await Character.move_towards(target);
			if (Character.is_in_range(target)) {
				update_state(ATTACK);
			}

			break;

		case ATTACK:
			if (!target) {
				update_state(IDLE);
				break;
			}

			if (!Character.is_in_range(target)) {
				update_state(ADVANCE);
			}

			await Skill.attack.wait_until_ready();
			Skill.attack.use(target).catch((e) => {
				// Possible reasons:
				// not_found - Target not found
				// to_far - Target too far away
				// cooldown - Attack is still on cooldown
				// no_mp - No MP
				// disabled - Character is disabled (e.g. stunned)
				// friendly - Can't attack friendly targets
				// failed - Other reasons
				logging.debug('Attack failed', e.reason);
			});

			if (Character.distance(target) < TARGET_RETREAT_DISTANCE) {
				update_state(RETREAT);
				break;
			}

			break;

		case RETREAT:
			if (!target) {
				update_state(IDLE);
				break;
			}

			const dist = Character.distance(target);
			if (dist >= character.range) {
				update_state(IDLE);
				break;
			}

			// Retreat to max range
			await Character.retreat_from(target, character.range - dist);

			update_state(ATTACK);
			break;

		case FLEE_TO_TOWN:
			if (is_in_town()) {
				update_state(IDLE);
				break;
			}

			if (target) {
				await Character.retreat_from(target, 10 * TARGET_RETREAT_DISTANCE);
			}

			await Skill.use_town.wait_until_ready();
			Skill.use_town.use();

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
	logging.info('== Starting CODE ==')
	logging.debug('Start time:', new Date());
	Character.change_target(null);

	BattleLog.monitor();

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
