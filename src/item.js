// Item upgrades and compounding
// @ts-check

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
