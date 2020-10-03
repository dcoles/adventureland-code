// Bank functions
// @ts-check
import * as Item from '/item.js';
import * as Util from '/util.js';

/**
 * Bank item accounts.
 *
 * @returns {Map<string, Array<Item | null>>} Mapping of account name to account slots.
 */
export function accounts() {
	if (!character.bank) {
		throw new Error('Not in bank');
	}

	return new Map(Object.entries(character.bank).filter(([name, _]) => name !== 'gold'));
}

/**
 * Gold in bank.
 *
 * @returns {number}
 */
export function gold() {
	if (!character.bank) {
		throw new Error('Not in bank');
	}

	return character.bank.gold;
}

/**
 * Sort bank items by stack value, then lexographically.
 *
 * @param {string} name Bank account name.
 */
export async function sort_account(name) {
	const account_size = character.bank[name].length;
	for (let i = 0; i < account_size; i++) {
		const acc = character.bank[name];
		let k = i;  // Start at current slot
		for (let j = i; j < account_size; j++) {
			if (!acc[j]) {
				// Empty slot
				continue;
			}

			if (!acc[k]) {
				// Something is always worth more than nothing
				k = j;
				continue;
			}

			const j_value = Item.stack_value(acc[j]);
			const k_value = Item.stack_value(acc[k]);

			if (j_value === k_value && acc[j].name < acc[k].name || j_value > k_value) {
				k = j;
			}
		}

		// Only move an item if needed
		if (i != k) {
			bank_move(name, k, i);
			await new Promise(resolve => parent.socket.once('player', resolve));
		}
	}
}
