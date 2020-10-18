// Item upgrades and compounding
// @ts-check
import * as Util from '/util.js';

// Build a map of Quest IDs → NPC IDs
// If we can't find the NPC's location, assume we can exchange at Xyn
const QUEST_NPCS = new Map(Object.entries(G.npcs)
	.filter(([id, npc]) => npc.quest && find_npc(id))
	.map(([id, npc]) => [npc.quest, id]));

/**
 * Item grade.
 */
export const Grade = {
	COMMON: 0,
	HIGH: 1,
	RARE: 2,
	LEGENDARY: 3,
}

/**
 * Criteria for matching items.
 *
 * @typedef ItemCriteria
 * @property {string} [name] Item name/ID
 * @property {number} [level] Item level
 * @property {number} [max_grade] Maximum item grade
 * @property {boolean} [upgradeable] Is item upgradeable?
 * @property {boolean} [compoundable] Is item compoundable?
 * @property {boolean} [exchangeable] Is item exchangeable?
 */

 /**
  * @typedef ItemLocation
  * @property {number} slot Item slot index.
  * @property {string} [bank] If set, gives the name of the bank account.
  */

/**
 * Get indexed character items.
 *
 * @param {ItemCriteria} [criteria] Filter the returned items.
 * @returns {[number, Item][]} Array of `[index, item]` tuples.
*/
export function indexed_items(criteria) {
	criteria = criteria || {};
	return character.items.map((item, index) => [index, item]).filter(([_, item]) => match(item, criteria));
}

/**
 * Get current inventory items including location.
 *
 * @param {ItemCriteria} [criteria] Items must match this criteria.
 * @returns {[ItemLocation, Item][]} Array of `[item_location, item]` tuples.
 */
export function character_indexed_items(criteria) {
	criteria = criteria ?? {};
	return character.items.map((item, slot) => [{slot: slot}, item])
		.filter(([_, item]) => match(item, criteria));
}

/**
 * Get current bank items including location.
 *
 * @param {ItemCriteria} [criteria] Items must match this criteria.
 * @returns {[ItemLocation, Item][] | null} Array of `[item_location, item]` tuples or null if not in the bank.
 */
export function bank_indexed_items(criteria) {
	criteria = criteria ?? {};
	if (!character.bank) {
		return null;
	}

	const items = [];
	for (let [account_name, account_items] of Object.entries(character.bank)
		.filter(([name, _]) => name !== 'gold')) {

		items.push(...account_items.map((item, slot) => [{slot: slot, bank: account_name}, item])
			.filter(([_, item]) => match(item, criteria)));
	}

	return items;
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

	if (Number.isInteger(criteria.max_grade) && grade(item) > criteria.max_grade) {
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
	// Check if we have at least the required number of items to exchange
	return item.q >= G.items[item.name].e;
}

/**
 * Calculate the value of a item stack.
 *
 * @param {Item} item Item
 */
export function stack_value(item) {
	return (item.q || 1) * value(item);
}

/**
 * Calculate the value of a single item.
 *
 * @param {Item} item Item
 */
export function value(item) {
	// By default, this is the price a merchant will pay
	return parent.calculate_item_value(item);
}

/**
 * Grade of an item.
 *
 * @param {Item} item Item
 */
export function grade(item) {
	return window.item_grade(item);
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

/**
 * Find the NPC associated with a quest.
 *
 * @param {string} name Quest name.
 * @returns {string} NPC ID
 */
export function npc_for_quest(name) {
	return QUEST_NPCS.get(name) || 'exchange';
}
