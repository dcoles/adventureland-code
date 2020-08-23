// Main entrypoint.
// @ts-check

/**
 * Enable strict mode to help catch more bugs.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
 */

'use strict';

import * as Logging from './logging.js';
import * as Lib from './lib.js';
import * as Util from './util.js';
import * as Character from './character.js';
import * as BattleLog from './battleLog.js';

const IDLE_MS = 250;
const TARGET_MAX_HP_RATIO = 10.00;
const TARGET_MAX_ATTACK_RATIO = 0.80;

const STOP = 'Stop';
const IDLE = 'Idle';
const REPOSITION = 'Reposition';
const ATTACK = 'Attack';
const FLEE_TO_TOWN = 'Flee to Town';

/** Current behaviour */
let state = STOP;

/** Update current state */
function update_state(new_state) {
	if (new_state === state) {
		return;
	}

	set_message(new_state);
	Logging.info('New state', new_state);
	state = new_state;
}

/** Critical error */
export function critical(text, obj) {
	set_message('ERROR', 'red');
	state = STOP;
	Logging.error(text, obj);
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

/** Are we in a bad position? */
function in_bad_position(target) {
	const dist = Character.distance_to(target);

	return dist > character.range || dist < 0.20 * character.range;
}

/** Main loop */
async function mainloop() {
	character.on('hit', (data) => {
		// Focus on attacker
		if (data.damage > 0) {
			const attacker = get_entity(data.actor);
			Logging.info('Attacked by', attacker.name);
			Character.change_target(attacker);
		}
	});

	let i = 0;
	do {
		Logging.debug(`tick ${i++}`, state);

		// Always loot
		Character.loot();

		if (is_hp_critically_low()) {
			// Emergency maneuvers
			Character.skills.regen_hp.autouse();
			if (!Lib.is_in_town()) {
				update_state(FLEE_TO_TOWN);
			}
		} else if (is_mp_critically_low()) {
			// Need some mana to cast!
			Character.skills.regen_mp.autouse();
		} else if (character.hp < character.max_hp) {
			// Restore HP
			Character.skills.regen_hp.autouse();
		} else if (character.mp < character.max_mp) {
			// Restore MP
			Character.skills.regen_mp.autouse();
		}

		const target = pick_target();
		switch (state) {
			case STOP:
				// Do nothing
				await Util.sleep(IDLE_MS);
				break;

			case IDLE:
				await Util.sleep(IDLE_MS);

				// Pick a new target
				if (target) {
					Character.change_target(target);
					update_state(REPOSITION);
				} else {
					update_state(IDLE);
				}
				break;

		case REPOSITION:
			const dist = Character.distance_to(target);
			if (!dist) {
				update_state(IDLE);
				break;
			}

			// Target 80% of range
			const target_dist = 0.8 * character.range;
			if (Math.abs(dist - target_dist) > 10) {
				await Character.move_towards(target, dist - target_dist);
			}

			// Need to fix distance
			if (Character.is_in_range(target)) {
				update_state(ATTACK);
			}

			break;

		case ATTACK:
			if (!target) {
				update_state(IDLE);
				break;
			}

			if (in_bad_position(target)) {
				update_state(REPOSITION);
				break;
			}

			await Character.skills.attack.wait_until_ready();
			Character.skills.attack.use(target).catch((e) => {
				// Possible reasons:
				// not_found - Target not found
				// to_far - Target too far away
				// cooldown - Attack is still on cooldown
				// no_mp - No MP
				// disabled - Character is disabled (e.g. stunned)
				// friendly - Can't attack friendly targets
				// failed - Other reasons
				Logging.debug('Attack failed', e.reason);
			});

			break;

		case FLEE_TO_TOWN:
			if (Lib.is_in_town()) {
				update_state(IDLE);
				break;
			}

			if (target) {
				await Character.move_towards(target, -999);
			}

			await Character.skills.use_town.wait_until_ready();
			Character.skills.use_town.use();

			break;

		default:
			critical('Unhandled state', state);
			return;
		}

		// Slow down the loop for safety
		await Util.sleep(100);
	} while (true)
}

/** Main function */
function main() {
	Logging.info('== Starting CODE ==')
	Logging.debug('Start time:', new Date());
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
