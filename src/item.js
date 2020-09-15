// Item upgrades and compounding
// @ts-check
import * as Util from '/util.js';

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
export function scroll_level(item_id, item_level) {
	return G.items[item_id].grades.findIndex((g) => g > item_level);
}

/**
 * Retrieve a list of items from the bank.
 *
 * @param {Array<[string, number]>} items Items to retrieve (pack, pack_slot).
 */
export async function retrieve_items(items) {
	let free_slot = -1;
	for (let [pack, pack_slot] of items) {
		free_slot = find_free_inventory_slot(free_slot);
		if (free_slot == -1) {
			break;
		}

		window.bank_retrieve(pack, pack_slot, free_slot);
	}

	await Util.idle();
}

/**
 * Find empty inventory slot.
 *
 * @param {number} [after=-1] Find the next empty slot after this one.
 * @returns {number} Inventory index or -1 if no space available.
 */
export function find_free_inventory_slot(after) {
	after = after || -1;
	for (let i = after + 1; i < character.items.length; i++) {
		if (!character.items[i]) {
			return i;
		}
	}

	// No available space
	return -1;
}
