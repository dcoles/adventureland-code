// Main entrypoint.
// @ts-check

// TODO:
// - Sleep until we think a character will be in range
// - A better smart_move that avoids hostiles
// - Factor out movement engine
// - Implement "priority" system for needs

import * as Adventure from '/adventure.js';
import * as Logging from '/logging.js';
import * as Character from '/character.js';
import * as BattleLog from '/battlelog.js';
import * as Command from '/command.js';
import * as Widgets from '/widgets.js';
import * as Movement from './movement.js';
import * as Util from './util.js';

// Brains
import { AutoBrain } from '/brain/auto.js';
import { MerchantBrain } from '/brain/merchant.js';

// Debugging
const DEBUG_LOG_EVENTS = false;
const DEBUG_LOG_CEVENTS = false;

// Bots
const BOTS = ['LigLig', 'LigLug', 'LigLog'];
const BOT_SCRIPT = 'loader';

// Misc
const AUTO_PAUSE = true;  // Pause graphics on AFK

// Your Character
export const character = Character.get_character();

// Movement controller
export const movement = Movement.get_movement();

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
	movement.stop();
	if (g_brain) {
		g_brain.stop();
	}
}

/** Resume the main loop. */
export function start() {
	if (g_brain) {
		g_brain.resume();
	}
}

/** Start bots. */
export function start_bots() {
	Adventure.set('start_bots', true);
	_start_bots();
}

function _start_bots() {
	for (let name of BOTS) {
		if (name === character.name) {
			continue;
		}

		Logging.info('Starting bot', name);
		Adventure.start_character(name, BOT_SCRIPT);
	}
}

/** Stop bots. */
export function stop_bots() {
	Adventure.set('start_bots', false);
	_stop_bots();
}

function _stop_bots() {
	const chars = Adventure.get_characters();
	for (let [name, state] of Object.entries(window.get_active_characters())) {
		if (state === 'self') {
			continue;
		}

		Logging.info('Stopping bot', name);
		Adventure.stop_character(name);
	}
}

/**
 * Call /command on another character.
 *
 * @param {string} character Character name.
 * @param {string} command Command name.
 * @param  {...any} args Command arguments.
 */
export function call_character_command(character, command, ...args) {
	const namespace = Adventure.get_character_code(character);
	return namespace.Code.call_command(command, ...args);
}

/**
 * Call /command on this character.
 *
 * @param {string} command Command name.
 * @param {...any} args Command arguments.
 */
export function call_command(command, ...args) {
	return Command.call(command, ...args);
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
 * @returns {object} Home location set.
 */
export function set_home(location) {
	return g_brain.set_home(location);
}

/**
 * Get character's current home location.
 *
 * @returns {object|null} Home location.
 */
export function get_home() {
	return g_brain.get_home();
}

/**
 * Called when invited to join another character's party.
 *
 * @param {string} name Name of the character who sent the invitation.
 */
window.on_party_invite = function(name) {
	for (let char of Adventure.get_characters()) {
		if (char.name === name) {
			Adventure.accept_party_request(name);
		}
	}
}

/**
 * Called when another character requests to join our party.
 *
 * @param {string} name Name of the character who sent the request.
*/
window.on_party_request = function(name) {
	// Accept our characters
	for (let char of Adventure.get_characters()) {
		if (char.name === name) {
			Adventure.accept_party_request(name);
		}
	}
}

/**
 * Called when the map is clicked.
 *
 * @param {number} x x map-coordinate.
 * @param {number} y y map-coordinate.
 */
window.on_map_click = function(x, y) {
	// This is almost always better than the default
	movement.pathfind_move({x: x, y: y}, {single_map: true, max_distance: 1000, exact: true}).catch((e) => Logging.error('Move failed', e));
	return true;
}

/**
 * Called just before CODE is destroyed.
 */
window.on_destroy = function() {
	// Default behaviour
	window.clear_drawings();
	window.clear_buttons();

	// Stop bots
	_stop_bots();
}

/** Main function */
async function main() {
	Logging.info('== Starting CODE ==');
	window.set_message('Starting...');

	g_start_time = new Date();
	Logging.info('Start time', g_start_time);

	if (DEBUG_LOG_EVENTS) {
		window.game.all((name, data) => console.debug('EVENT:', name, data));
	}

	if (DEBUG_LOG_CEVENTS) {
		window.character.all((name, data) => console.debug('CEVENT:', name, data));
	}

	// Log combat events
	if (!character.bot) {
		BattleLog.monitor({party: true});
	}

	// Show XP/s and GOLD/s
	Widgets.stat_monitor('xp');
	Widgets.stat_monitor('gold')

	// Map snippets
	Adventure.map_snippet('G', 'Code.set_state("Return Home")');
	Adventure.map_snippet('H', 'Code.set_home()');
	Adventure.map_snippet('J', 'Code.start()');
	Adventure.map_snippet('K', 'Code.stop()');
	Adventure.map_snippet('M', 'Code.set_target()');

	// Map /commands
	Command.register('stopbrain', stop, null, ['character']);
	Command.register('startbrain', start, null, ['character']);
	Command.register('startbots', start_bots);
	Command.register('stopbots', stop_bots);
	Command.register('startbot', (name, script) => window.start_character(name, script || BOT_SCRIPT), ['character'], ['script'])
	Command.register('stopbot', name => window.stop_character(name), ['character'])
	Command.register('go', location => movement.pathfind_move(location), ['location']);
	Command.register('c', call_character_command, ['character', 'command'], ['arg1', 'arg2', 'arg3', 'arg4'])

	// Start our bots
	if (Adventure.get('start_bots') && character.ctype !== 'merchant') {
		_start_bots();
	}

	// Auto pause on AFK
	if (AUTO_PAUSE) {
		window.setInterval(() => {
			if (window.character.afk ^ window.is_paused()) {
				Logging.info('Toggling pause');
				window.pause();
			}
		}, Util.IDLE_MS);
	}

	// Start running!
	switch (character.ctype) {
		case 'merchant':
			g_brain = new MerchantBrain();
			break;

		default:
			g_brain = new AutoBrain();
			break;
	}

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
