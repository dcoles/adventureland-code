// Main entrypoint.
// @ts-check

// TODO:
// - Save brain state (e.g. stopped)
// - A better smart_move that avoids hostiles
// - Factor out movement engine
// - Implement "priority" system for needs

import * as Adventure from './adventure.js';
import * as Logging from './logging.js';
import * as Entity from './entity.js';
import * as Util from './util.js';
import * as Character from './character.js';
import * as BattleLog from './battlelog.js';

// Your Character
export const character = Character.get_character();

const IDLE_MS = 250;
const STOP_MS = 1000;
const TICK_MS = 1000;
const TARGET_RANGE_RATIO = 0.90;
const HOME_RANGE_RADIUS = 500;
const MIN_DIFFICULTY = 0.0;
const MAX_DIFFICULTY = 9.0;
const KITING_THRESHOLD = 0.5;
const MOVEMENT_TOLLERANCE = 50;

// Global variables
let g_start_time = null;
let g_brain = null;

export function get_brain() {
	return g_brain;
}

/**
 * Report a critical error.
 *
 * Stops the main loop and logs to console.
 *
 * @param {string} text Log message.
 * @param {*} obj Additional context.
 */
function critical(text, obj) {
	Logging.error(text, obj);

	if (g_brain) {
		g_brain.stop();
	}
}

/** Stop the main loop. */
export function stop() {
	if (g_brain) {
		g_brain.stop();
	}
}

/** Resume the main loop. */
export function resume() {
	if (g_brain) {
		g_brain.resume();
	}
}

/** Explicitly set a target. */
export function set_target(target) {
	target = target || window.get_targeted_monster()

	if (g_brain) {
		g_brain.set_target(target);
	}
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
 * Get character's current home location.
 *
 * @returns {object|null} Home location.
 */
export function get_home() {
	return Adventure.get('home');
}

class Brain {
	constructor() {
		this.stopped = false;
		this.home = null;
		this.tick = 0;
		this.target = null;
		this.target_difficulty = 0;
	}

	/** Are we interrupted? */
	is_interrupted() {
		return this.stopped || character.is_dead();
	}

	/** Are we safe? */
	is_safe() {
		const hp_ratio = character.hp / character.max_hp;

		// Must either have more than 10% HP or we're within 100px of the map origin
		return hp_ratio > 0.10 || character.distance(0, 0) < 100;
	}

	/** Is our target alive? */
	is_target_alive() {
		return this.target && !this.target.dead;
	}

	/** Are we within our home range? */
	is_home() {
		return character.map == this._home.map
		&& character.distance(this._home.x, this._home.y) < this._home.range;
	}

	/** Is our HP getting low? */
	is_low_hp() {
		const hp_ratio = character.hp / character.max_hp;
		return hp_ratio < 0.30;  // Below 30%
	}

	/** Called on major state updates. */
	on_state(state) {
		Logging.info('State', state);
		set_message(state);
	}

	/** Regular tick. */
	on_tick(tick) {
		Logging.debug('Tick', tick);
		if (character.is_dead()) {
			// Nothing to do but go through his clothes and look for loose change.
			return;
		}

		character.loot()
		this._update_autocasts();
	}

	/**
	 * Stop the event loop.
	 */
	stop() {
		Logging.warn('Stopping event loop');
		this.stopped = true;

		// Cease all motor functions
		character.stop_all();
	}

	/** Resume the event loop. */
	resume() {
		Logging.warn('Resuming event loop');
		this.stopped = false;
	}

	/** Set current target. */
	set_target(target) {
		if (!target) {
			this.target = null;
			this.target_difficulty = 0;
			return;
		}

		this.target = target;
		this.target_difficulty = Entity.difficulty(this.target);
		Logging.info(`Target: ${target.name} (${this.target_difficulty.toFixed(1)})`);
		character.change_target(target);
	}

	/** Run the main loop. */
	async run() {
		await this._init();
		do {
			if (this.stopped) {
				this.on_state('Stop');
				await this._stop();
			} else if (character.is_dead()) {
				this.on_state('RIP');
				await this._rip();
			} else if (!this.is_safe()) {
				this.on_state('Panic');
				await this._panic();
			} else if (this.is_target_alive()) {
				this.on_state('Attack');
				await this._attack();
			} else if (this.is_low_hp()) {
				this.on_state('Rest');
				await this._rest();
			} else {
				this.on_state('Find');
				await this._find_next_target();
			}

			// Small pause for safety
			await Util.sleep(100);
		} while (true)
	}

	async _init() {
		// Remember where we started
		this._home = get_home();
		if (!this._home) {
			this._home = set_home(null, HOME_RANGE_RADIUS);
		}

		Logging.info(`Home: ${Entity.to_string(this._home)} on ${this._home.map} (range: ${this._home.range})`);
		window.draw_circle(this._home.x, this._home.y, this._home.range, null, 0xffff00);

		// Focus on attacker when hit
		character.on('hit', (data) => {
			if (data.damage > 0) {
				const attacker = get_entity(data.actor);
				Logging.warn('Attacked by', attacker ? attacker.name : '???');
				character.stop('move');
				this.set_target(attacker);
			}
		});

		// Reoccuring timer
		setInterval(() => this._tick(), TICK_MS);
	}

	/** Timer tick */
	_tick() {
		if (this.stopped) {
			return;
		}

		this.on_tick(this.tick++);
	}

	/** Update the selected autocasts. */
	_update_autocasts() {
		const hp_ratio = character.hp / character.max_hp;
		const mp_ratio = character.mp / character.max_mp;

		if (hp_ratio < 0.10) {  // below 10% HP
			character.skills.regen_hp.autouse(null, null, () => !character.is_fully_healed() && !this.is_interrupted());
		} else if (mp_ratio < 0.10) {  // below 10% MP
			// We need mana to cast!
			character.skills.regen_mp.autouse(null, null, () => !character.is_fully_charged() && !this.is_interrupted());
		} else if (hp_ratio < 1.00) {  // below 100% HP
			// Restore HP
			character.skills.regen_hp.autouse(null, null, () => !character.is_fully_healed() && !this.is_interrupted());
		} else if (mp_ratio < 1.00) {  // below 100% MP
			// Restore MP
			character.skills.regen_mp.autouse(null, null, () => !character.is_fully_charged() && !this.is_interrupted());
		}
	}

	/** Wait until loop is restarted. */
	async _stop() {
		while (this.stopped) {
			await Util.sleep(STOP_MS);
		}
	}

	/** "He's dead Jim." */
	async _rip() {
		Logging.warn('Died at', new Date());
		character.stop_all();

		// Respawn after short delay (respawn has 12-sec cooldown)
		Logging.info('Respawning in 15s...')
		await Util.sleep(15_000);
		Adventure.respawn();
	}

	/** Emergency maneuvers. */
	async _panic() {
		// Stop whatever we were doing
		character.stop_all();

		if (character.skills.blink && character.skills.blink.is_usable()) {
			// Mages can blink away
			await character.skills.blink.use([0, 0]);

		} else {
			// We're probably under attack
			if (this.target && !this.target.dead) {
				// Start running away
				character.move_towards(this.target, -999);

				// Pop a potion
				await character.skills.use_hp.use_when_ready();
			}

			// Warp to map origin
			await character.skills.use_town.use_when_ready();
		}

		// Heal up
		await this._heal_up();
	}

	/** Heal until we're fully recovered (or start losing HP). */
	async _heal_up() {
		let last_hp = character.hp;

		// Let autocasts do their job
		while (character.hp < character.max_hp && character.hp >= last_hp && !this.is_interrupted()) {
			last_hp = character.hp;
			await Util.sleep(IDLE_MS);
		}
	}

	/** Return to home and recover some HP. */
	async _rest() {
		await this._return_home();
		await this._heal_up();
	}

	/** Attack current target */
	async _attack() {
		// Start auto-attacking
		character.skills.attack.autouse(this.target);

		while (this.is_target_alive() && !this.is_interrupted()) {
			const dist = character.distance_between(this.target);
			if (!dist) {
				break;
			}

			// Try to keep target at a good range
			const target_dist = TARGET_RANGE_RATIO * character.range;
			const move = dist - target_dist;

			if (Math.abs(move) > MOVEMENT_TOLLERANCE) {
				if (this.is_kiting() || move > 0) {
					await character.move_towards(this.target, move);
				}
			}

			await Util.sleep(IDLE_MS);
		}
	}

	/**
	 * Are we kiting enemies?
	 *
	 * @returns {boolean} True if kiting, otherwise False.
	 */
	is_kiting() {
		// Always kite difficult enemies or if our HP is below 50%
		const hp_ratio = character.hp / character.max_hp;
		return this.target_difficulty > KITING_THRESHOLD || hp_ratio < 0.50;
	}

	/** Find and move to our next target. */
	async _find_next_target() {
		// See if we can find a target nearby
		this._pick_target();
		if (this.target) {
			return;
		}

		// Return to home range
		if (!this.is_home()) {
			await this._return_home();
		}

		// Keep searching for a target
		do {
			this._pick_target();
			await Util.sleep(IDLE_MS);
		} while (!this.target && !this.is_interrupted())
	}

	/** Try to pick a new target. */
	_pick_target() {
		if (character.targets) {
			// Someone is trying to attack us! Attack them back!
			const targeted_by = Entity.get_nearest_monsters({target: character})
			if (targeted_by.length != 0) {
				this.set_target(targeted_by[0]);
				return;
			}
		}

		for (let monster of Entity.get_nearest_monsters({path_check: true, no_target: true})) {
			const difficulty = Entity.difficulty(monster);
			if (difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) {
				continue;
			}

			this.set_target(monster);
			break;
		}
	}

	/** Return to our home location */
	async _return_home() {
		Logging.info(`Returning to home in ${this._home.map}`);
		try {
			await character.xmove(this._home.x, this._home.y, this._home.map);
		} catch (e) {
			if (e.reason != 'interrupted') {
				throw e;
			}
		}
	}
}

/**
 * Called when invited to a party.
 *
 * @param {string} name Name of the character who set the invitation.
 */
window.on_party_invite = function(name) {
	if (Adventure.get_player(name).owner != character.owner) {
		return;
	}

	Adventure.accept_party_invite(name);
}

/** Main function */
async function main() {
	Logging.info('== Starting CODE ==')

	g_start_time = new Date();
	Logging.info('Start time', g_start_time);

	character.change_target(null);

	BattleLog.monitor();

	// Log all events
	game.all((name, data) => {
		//console.log('EVENT:', name, data);
	});

	// Map snippets
	Adventure.map_snippet('G', 'Code.set_state("Return Home")');
	Adventure.map_snippet('H', 'Code.set_home()');
	Adventure.map_snippet('J', 'Code.resume()');
	Adventure.map_snippet('K', 'Code.stop()');
	Adventure.map_snippet('M', 'Code.set_target()');

	// Start running!
	g_brain = new Brain();
	g_brain.run().catch((e) => {
		critical('Unhandled exception in brain', e);
	});
}

// Run and log any uncaught errors
try {
	main();
} catch (err) {
	critical('Unhandled exception', err);
}
