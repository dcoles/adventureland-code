// Battle log
// This monitors nearby events and adds them to the log window.
//
// Usage:
//   import { BattleLog } from '/battlelog.js';
//   BattleLog.monitor();
//
// @ts-check

import * as Logging from '/logging.js';

/**
 * Monitor nearby events and write them to the log.
 */
class BattleLog {
	/**
	 * @param {object} [options] BattleLog options.
	 * @param {string} [options.entity_id] Entity to monitor (default: `character`).
	 * @param {boolean} [options.party] Monitor all party members.
	 * @param {boolean} [options.all] Monitor all actors.
	 */
	constructor(options) {
		options = options || {}

		this.all = options.all || false;
		this.party = options.party || false;
		this.entity_id = options.entity_id || character.name;
	}

	/**
	 * Called on Global 'hit' events.
	 *
	 * @param {object} data Event data.
	 */
	on_hit(data) {
		const party = window.get_party();
		if (!(this.all
			|| (this.party && (data.actor in party || data.target in party))
			|| (data.actor === this.entity_id || data.target === this.entity_id))) {
			return;
		}

		Logging.debug('hit', data);
		const actor = get_entity(data.actor);
		const target = get_entity(data.target);

		let msg = actor_name_with_icon(actor);
		if (data.miss) { msg += ' misses ' }
		else if (data.heal) { msg += ' heals ' }
		else { msg += ' hits '};
		msg += actor_name_with_icon(target);
		if (!data.miss) { msg += ` for ${(data.heal || data.damage).toLocaleString()}` };

		// Statues
		let statuses = [];
		if (data.crit) statuses.push('crit!');
		if (data.poison) statuses.push('poisoned');
		if (data.freeze) statuses.push('frozen');
		if (data.stun) statuses.push('stunned');
		if (data.sneak) statuses.push('sneak!');

		if (statuses.length) {
			msg += ` [${statuses.join(', ')}]`;
		}

		safe_log(msg, 'orange');
	}
}

/**
 * Create a BattleLog and start monitoring events.
 *
 * @param {object} [options] BattleLog options.
 * @param {string} [options.entity_id] Entity to monitor (default: `character`).
 * @param {boolean} [options.party] Monitor all party members.
 * @param {boolean} [options.all] Monitor all actors.
 */
export function monitor(options) {
	const battlelog = new BattleLog(options);
	game.on('hit', (data) => battlelog.on_hit(data));

	return battlelog;
}

/**
 * Get the name of an actor.
 *
 * @param {object} actor Actor object (character or monster).
 * @returns {string} The actor's name or '???'.
 **/
function actor_name(actor) {
	if (!actor || !actor.name) {
		return '???';
	} else {
		return actor.name;
	}
}

/**
 * Get the name of an actor with assocated icon.
 *
 * @param {object} actor Actor object (character or monster).
 * @returns {string} The actor's icon+name or '???'.
 **/
function actor_name_with_icon(actor) {
	return icon(actor) + actor_name(actor);
}

/**
 * Get associated icon for an actor.
 *
 * @param {object} actor Actor object (character or monster).
 * @returns {string} The actor's icon or ''.
 */
function icon(actor) {
	if (!actor) {
		return '';
	}

	switch (actor.type) {
		case 'character':
			return '@';
		case 'monster':
			return '~';
		default:
			return '';
	}
}
