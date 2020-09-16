// Item upgrades and compounding
// @ts-check
import * as Util from '/util.js';

/**
 * Criteria for matching items.
 *
 * @typedef ItemCriteria
 * @property {string} [name] Item name/ID
 * @property {number} [level] Item level
 * @property {boolean} [upgradeable] Is item upgradeable?
 * @property {boolean} [compoundable] Is item compoundable?
 * @property {boolean} [exchangeable] Is item exchangeable?
 */

/**
 * Get indexed character items.
 *
 * @param {ItemCriteria} [criteria] Filter the returned items.
 * @returns {[number, object][]} Array of `[index, item]` tuples.
*/
export function indexed_items(criteria) {
	criteria = criteria || {};
	return character.items.map((item, index) => [index, item]).filter(([_, item]) => match(item, criteria));
}

/**
 * Find slot of an item.
 *
 * @param {ItemCriteria} criteria Criteria for matching item.
 * @returns {number} Inventory slot.
 */
export function find(criteria) {
	return character.items.findIndex((item) => match(item, criteria));
}

/**
 * Does this item match certain criteria?
 *
 * @param {Item} item
 * @param {ItemCriteria} criteria
 */
export function match(item, criteria) {
	if (!item) {
		return false;
	}

	if (criteria.name && item.name !== criteria.name) {
		return false;
	}

	if (Number.isInteger(criteria.level) && item.level !== criteria.level) {
		return false;
	}

	if (criteria.upgradeable && !is_upgradeable(item)) {
		return false;
	}

	if (criteria.compoundable && !is_compoundable(item)) {
		return false;
	}

	if (criteria.exchangeable && !is_exchangeable(item)) {
		return false;
	}

	return true;
}

/**
 * Is this item upgradeable?
 *
 * @param {Item} item Item ID (e.g. "helm")
 */
export function is_upgradeable(item) {
	return 'upgrade' in G.items[item.name];
}

/**
 * Is this item upgradeable?
 *
 * @param {Item} item Item
 */
export function is_compoundable(item) {
	return 'compound' in G.items[item.name];
}

/**
 * Is this item exchangeable?
 *
 * @param {Item} item Item object
 */
export function is_exchangeable(item) {
	return item.q >= G.items[item.name].e;
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
