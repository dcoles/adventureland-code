// Item upgrades and compounding
// @ts-check
import * as Logging from '/logging.js';
import * as Movement from '/movement.js';

const movement = Movement.get_movement();

/**
 * Compound all of a certain type of item.
 *
 * @param {string} name Name of item (e.g. "hpamulet").
 * @param {number} max_level Maximum level to compound to.
 * @param {string} [scroll] Combining scroll (default: auto).
 */
export async function compound_all(name, max_level, scroll) {
	await movement.smarter_move('compound');
	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `cscroll${scroll_level(name, level)}`;
		const i_scrolls = indexed_items({name: scroll_});
		const i_items = indexed_items({name: name, level: level});

		// Combine!
		for (let i=0; i<i_items.length-2; i+=3) {
			const i_scroll = i_scrolls[0];
			if (!i_scroll || i_scroll[1].q < 1) {
				// Need more scrolls
				await window.buy_with_gold(scroll_, 5);
			}

			try {
				Logging.info(`Compounding ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
				await window.compound(i_items[i][0], i_items[i+1][0], i_items[i+2][0], i_scroll[0]);
			} catch (e) {
				Logging.warn('Compounding failed', e.reason);
			}
		}
	}
}

/**
 * Upgrade all of a certain item.
 *
 * @param {string} name Name of item (e.g. "slimestaff").
 * @param {number} max_level Maximum level to upgrade to.
 * @param {string} [scroll] Upgrade scroll (default: auto).
 */
export async function upgrade_all(name, max_level, scroll) {
	await movement.smarter_move('upgrade');

	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `scroll${scroll_level(name, level)}`;
		const i_scrolls = indexed_items({name: scroll_});
		const i_items = indexed_items({name: name, level: level});

		// Upgrade!
		for (let i=0; i<i_items.length; i++) {
			const i_scroll = i_scrolls[0];
			if (!i_scroll || i_scroll[1].q < 1) {
				// Need more scrolls
				await window.buy_with_gold(scroll_, 5);
			}

			try {
				Logging.info(`Upgrading ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
				await window.upgrade(i_items[i][0], i_scroll[0]);
			} catch (e) {
				Logging.warn('Upgrading failed', e.reason);
			}
		}
	}
}

/**
 * Get indexed character items.
 *
 * @param {object} [filter] Filter the returned items.
 * @param {string} [filter.name] Match item name.
 * @param {number} [filter.level] Match item level.
 * @returns {[number, object][]} Array of `[index, item]` tuples.
*/
export function indexed_items(filter) {
	filter = filter || {};
	return character.items.map((item, index) => [index, item]).filter(([_, item]) => {
		if (!item) {
			// Empty slot
			return false;
		}

		if (filter.name && item.name !== filter.name) {
			return false;
		}

		if (Number.isInteger(filter.level) && item.level !== filter.level) {
			return false;
		}

		return true;
	});
}

/**
 * Find slot of an item.
 *
 * @param {object} criteria Criteria for matching item.
 * @param {string} [criteria.name] Match item name.
 * @param {number} [criteria.level] Match item level.
 * @returns {number} Inventory slot.
 */
export function find(criteria) {
	return character.items.findIndex((item) => {
		if (!item) {
			return false;
		}

		if (criteria.name && item.name !== criteria.name) {
			return false;
		}

		if (Number.isInteger(criteria.level) && item.level !== criteria.level) {
			return false;
		}

		return true;
	})
}

/**
 * What is the minimum scroll level we must use to upgrade this item?
 *
 * @param {string} item_id Item ID (e.g. `"hpamulet"`).
 * @param {number} item_level Current item level.
 * @returns {number} Scroll level.
 */
function scroll_level(item_id, item_level) {
	return G.items[item_id].grades.findIndex((g) => g > item_level);
}
