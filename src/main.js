// Main entrypoint.
// @ts-check

// TODO:
// - Sleep until we think a character will be in range
// - A better smart_move that avoids hostiles
// - Factor out movement engine
// - Implement "priority" system for needs

import * as Adventure from '/adventure.js';
import * as Logging from '/logging.js';
import * as AutoBrain from '/brain/auto.js';
import * as Character from '/character.js';
import * as BattleLog from '/battlelog.js';
import * as Command from '/command.js';
import * as Widgets from '/widgets.js';
import * as Item from '/item.js';
import * as Movement from './movement.js';

// Your Character
export const character = Character.get_character();

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
 * @param  {...any} args Command arguments.
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
 * Attempt to compound items.
 *
 * @param {string} name Item name (e.g. "hpamulet")
 * @param {number} [max_level=4] Maximum level to upgrade to.
 * @param {string} [scroll='cscroll0'] Combining scroll.
 */
export function compound_items(name, max_level, scroll) {
	max_level = max_level || 2;
	if (!G.items[name]) {
		Logging.error(`Unknown item: ${name}`);
		return;
	}

	set_message('Compounding', 'dodgerblue');
	Logging.info(`Compounding all ${G.items[name].name} to level ${max_level}`);

	Item.compound_all(name, max_level, scroll)
	.then(() => { Logging.info('Finished compounding items'); set_message('Done') })
	.catch((e) => { Logging.warn('Compounding items failed', e.reason); set_message('Failed', 'orange') });
}

/**
 * Attempt to upgrade items.
 *
 * @param {string} name Item name (e.g. "slimestaff")
 * @param {number} [max_level=4] Maximum level to upgrade to.
 * @param {string} [scroll='scroll0'] Upgrade scroll.
 */
export function upgrade_items(name, max_level, scroll) {
	max_level = max_level || 4;
	if (!G.items[name]) {
		Logging.error(`Unknown item: ${name}`);
		return;
	}

	set_message('Upgrading', 'firebrick');
	Logging.info(`Upgrading all ${G.items[name].name} to level ${max_level}`);

	Item.upgrade_all(name, max_level, scroll)
	.then(() => { Logging.info('Finished upgrading items'); set_message('Done') })
	.catch((e) => { Logging.warn('Upgrading items failed', e.reason); set_message('Failed', 'orange') });
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
	Movement.pathfind_move({x: x, y: y}, {max_distance: 1000, exact: true}).catch((e) => Logging.error('Move failed', e));
	return true;
}

/** Main function */
async function main() {
	Logging.info('== Starting CODE ==');

	g_start_time = new Date();
	Logging.info('Start time', g_start_time);

	change_target(null);

	// Log combat events
	if (!character.bot) {
		BattleLog.monitor();
	}

	// Log all events
	game.all((name, data) => {
		//console.log('EVENT:', name, data);
	});

	// Show XP/s and GOLD/s
	Widgets.stat_monitor('xp');
	Widgets.stat_monitor('gold')

	// Map snippets
	Adventure.map_snippet('G', 'Code.set_state("Return Home")');
	Adventure.map_snippet('H', 'Code.set_home()');
	Adventure.map_snippet('J', 'Code.resume()');
	Adventure.map_snippet('K', 'Code.stop()');
	Adventure.map_snippet('M', 'Code.set_target()');

	// Map /commands
	Command.register('compound', compound_items, ['item'], ['max_level:int', 'scroll']);
	Command.register('upgrade', upgrade_items, ['item'], ['max_level:int', 'scroll']);
	Command.register('stopbrain', stop, null, ['character']);
	Command.register('resumebrain', resume, null, ['character']);
	Command.register('go', Adventure.smart_move, ['location']);
	Command.register('c', call_character_command, ['character', 'command'], ['arg1', 'arg2', 'arg3', 'arg4'])

	// Start running!
	g_brain = AutoBrain.get_brain();
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
