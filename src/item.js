// Item upgrades and compounding
// @ts-check
import * as Adventure from '/adventure.js';
import * as Logging from '/logging.js';

/**
 * Compound all of a certain type of item.
 *
 * @param {string} name Name of item (e.g. "hpamulet").
 * @param {number} max_level Maximum level to compound to.
 * @param {string} [scroll='cscroll0'] Combining scroll.
 */
export async function compound_all(name, max_level, scroll) {
	scroll = scroll || 'cscroll0';

	await Adventure.smart_move('compound');
	for (let level=0; level<max_level; level++) {
		const i_scrolls = indexed_items({name: scroll});
		const i_items = indexed_items({name: name, level: level});

		// Combine!
		for (let i=0; i<i_items.length-2; i+=3) {
			const i_scroll = i_scrolls[0];
			if (!i_scroll || i_scroll[1].q < 1) {
				// No more scrolls
				Logging.warn(`Can't compound: No ${G.items[scroll].name}`);
				return;
			}

			try {
				Logging.info(`Compounding ${G.items[name].name} (${level} to ${level+1})`);
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
 * @param {string} [scroll='scroll0'] Upgrade scroll.
 */
export async function upgrade_all(name, max_level, scroll) {
	scroll = scroll || 'scroll0';

	await Adventure.smart_move('upgrade');
	for (let level=0; level<max_level; level++) {
		const i_scrolls = indexed_items({name: scroll});
		const i_items = indexed_items({name: name, level: level});

		// Upgrade!
		for (let i=0; i<i_items.length; i++) {
			const i_scroll = i_scrolls[0];
			if (!i_scroll || i_scroll[1].q < 1) {
				// No more scrolls
				Logging.warn(`Can't upgrade: No ${G.items[scroll].name}`);
				return;
			}

			try {
				Logging.info(`Upgrading ${G.items[name].name} (${level} to ${level+1})`);
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
function indexed_items(filter) {
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
