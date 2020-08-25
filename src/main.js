// Main entrypoint.
// @ts-check

import * as Adventure from './adventure.js';
import * as Logging from './logging.js';
import * as Lib from './lib.js';
import * as Util from './util.js';
import * as Character from './character.js';
import * as BattleLog from './battleLog.js';

const IDLE_MS = 250;
const TARGET_MIN_RANGE_FACTOR = 0.60;
const TARGET_MAX_RANGE_FACTOR = 0.90;
const HOME_RANGE = 500;

const STOP = 'Stop';
const IDLE = 'Idle';
const RETURN_HOME = 'Return Home';
const REPOSITION = 'Reposition';
const ATTACK = 'Attack';
const FLEE_TO_TOWN = 'Flee to Town';

/** Current behaviour */
let state = STOP;

/**
 * Set main loop state.
 *
 * @param {string} new_state Next state to enter.
 */
export function set_state(new_state) {
	if (new_state === state) {
		return;
	}

	set_message(new_state);
	console.info('State:', new_state);
	state = new_state;
}

/**
 * Report a critical error.
 *
 * Stops the main loop and logs to console.
 *
 * @param {string} text Log message.
 * @param {*} obj Additional context.
 */
export function critical(text, obj) {
	set_message('ERROR', 'red');
	state = STOP;
	Logging.error(text, obj);
}

/** Pick a target to attack */
function pick_target() {
	let target = Character.get_targeted_monster();
	if (target && !target.dead) {
		// Already targetting a monster
		return target;
	}

	if (is_hp_low()) {
		// HP too low for combat
		return null;
	}

	target = Lib.get_nearest_monster({
		max_difficulty: 6,
		path_check: true,
		no_target: true,
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

	// Either we can't attack, or they can attack us!
	return dist > character.range || dist < Math.max(target.range, TARGET_MIN_RANGE_FACTOR * character.range);
}

/**
 * Set character's home location.
 *
 * @param {object} [location] Location to set as home (default: current location).
 * @param {number} [range=100] The radius of the home location.
 * @returns {object} Home location set.
 */
export function set_home(location, range) {
	location = location || {x: character.x, y: character.y, map: character.map};
	range = range || 100;

	const home = Object.assign({range: range}, location);
	Adventure.set('home', home);

	return home
}

/**
 * @returns {boolean} Is the character in their home range?
 */
function is_home() {
	const home = Adventure.get('home');
	if (!home) {
		// No explicit home set
		return true;
	}

	return Util.distance(character.x, character.y, home.x, home.y) <= home.range;
}

/**
 * Get character's current home location.
 *
 * @returns {object|null} Home location.
 */
export function get_home() {
	return Adventure.get('home');
}

/** Main loop */
async function mainloop() {
	// Remember where we started
	let home = get_home();
	if (!home) {
		home = set_home(null, HOME_RANGE);
	}
	Logging.info(`Home: ${Lib.position_to_string(home)} on ${home.map} (range: ${home.range})`);
	window.draw_circle(home.x, home.y, home.range, null, 0xffff00);

	character.on('hit', (data) => {
		// Focus on attacker
		if (data.damage > 0) {
			const attacker = get_entity(data.actor);
			Logging.info('Attacked by', attacker.name);
			Character.change_target(attacker);
		}
	});

	// Always loot
	window.setInterval(() => Character.loot(), 1000);

	let i = 0;
	let target = null;
	do {
		Logging.debug(`tick ${i++}`, state);

		if (is_hp_critically_low()) {
			// Emergency maneuvers
			Character.skills.regen_hp.autouse();
			if (!Lib.is_in_town()) {
				set_state(FLEE_TO_TOWN);
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

		switch (state) {
			case STOP:
				// Do nothing
				await Util.sleep(IDLE_MS);
				break;

			case IDLE:
				await Util.sleep(IDLE_MS);

				// Pick a new target
				target = pick_target();
				Character.change_target(target);
				if (!target) {
					if (!is_home()) {
						set_state(RETURN_HOME);
					}
					break;
				}

				const difficulty = Lib.target_difficulty(target);
				Logging.info(`Target: ${target.name} (${difficulty.toFixed(1)})`);
				if (!Character.is_in_range(target)) {
					set_state(REPOSITION);
				} else {
					set_state(ATTACK);
				}

				break;

			case RETURN_HOME:
				const home = get_home();
				if (!home) {
					Logging.warn('No home set!');
					set_state(IDLE);
					break;
				}

				Logging.info(`Returning to home range in ${home.map}`);
				await Character.xmove(home.x, home.y, home.map);
				set_state(IDLE);

				break;

			case REPOSITION:
				if (!target || target.dead) {
					set_state(IDLE);
					break;
				}

				const dist = Character.distance_to(target);
				if (!dist) {
					set_state(IDLE);
					break;
				}

				// Target 80% of range
				const target_dist = TARGET_MAX_RANGE_FACTOR * character.range;
				if (Math.abs(dist - target_dist) > 10) {
					await Character.move_towards(target, dist - target_dist);
				}

				// Need to fix distance
				if (Character.is_in_range(target)) {
					set_state(ATTACK);
				}

				break;

			case ATTACK:
				if (!target || target.dead) {
					set_state(IDLE);
					break;
				}

				Character.skills.attack.autouse(target);
				/*
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
				*/

				// Always reposition after attacking
				// This prevents us trying to reposition when stuck
				if (in_bad_position(target)) {
					set_state(REPOSITION);
					break;
				}

				break;

			case FLEE_TO_TOWN:
				if (Lib.is_in_town()) {
					set_state(IDLE);
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

	set_state(IDLE);

	// Log all events
	game.all((name, data) => {
		//console.log('EVENT:', name, data);
	});

	// Export functions
	Adventure.map_snippet('G', 'Code.set_state("Return Home")');
	Adventure.map_snippet('H', 'Code.set_home()');
	Adventure.map_snippet('J', 'Code.set_state("Idle")');
	Adventure.map_snippet('K', 'stop();Code.set_state("Stop")');

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
