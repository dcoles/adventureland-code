// Battle log
// This monitors nearby events and adds them to the log window.
//
// Usage:
//   import { BattleLog } from './battlelog.js';
//   BattleLog.monitor();

import * as logging from './logging.js';

/**
 * Monitor nearby events and write them to the log.
 */
export class BattleLog {
	/**
	 * @param {entity_id} options.entity_id Entity to monitor (default: `character`).
	 * @param {bool} options.all Monitor all actors.
	 */
	constructor(options) {
		options = options || {}

		this.all = options.all || false;
		this.entity_id = options.entity_id || character.name;
	}

	/** Create a BattleLog and start monitoring events. */
	static monitor(options) {
		const battlelog = new BattleLog(options);
		game.on('hit', (data) => battlelog.on_hit(data));

		return battlelog;
	}

	on_hit(data) {
		if (!this.all && data.actor !== this.entity_id && data.target !== this.entity_id) {
			return;
		}

		logging.debug('hit', data);
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

function actor_name(actor) {
	if (!actor || !actor.name) {
		return '???';
	} else {
		return actor.name;

	}
}

function actor_name_with_icon(actor) {
	return icon(actor) + actor_name(actor);
}

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