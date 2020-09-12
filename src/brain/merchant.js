// Brain for a merchant
// @ts-check
import * as Adventure from '/adventure.js';
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Item from '/item.js';
import * as Logging from '/logging.js';
import * as Movement from '/movement.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

// Brain
import { Brain } from '/brain/brain.js';

// Number of items required to compound
const N_COMPOUNDED = 3;

// Highest levels to upgrade/compound to
const MAX_UPGRADE = {
	'cclaw': 6,
	'helmet': 5,
	'mace': 6,
	'shoes': 5,
	'wshoes': 6,
}
const MAX_COMPOUND = {}
const DEFAULT_MAX_UPGRADE = 4;
const DEFAULT_MAX_COMPOUND = 2;

// Bank packs
const UPGRADE_PACK = 'items0';
const COMPOUND_PACK = 'items1';
const MATERIAL_PACK = 'items1';

const character = Character.get_character();
const movement = Movement.get_movement();

export class MerchantBrain extends Brain {
	constructor() {
		super();

		this.home = {x: -120, y: 0, map: 'main'};  // Home for vending
		this.stock = null;  // Track bank contents
		this.tasks = {};
	}

	async _init() {
		Logging.info('Starting Merchant brain');
		window.set_message('Merchant');

		// Close our stand if it was open
		this.close_stand();

		// Task for keeping us healthy
		this.tasks['regen_autocast'] = Task.create(async (task) => {
			while (!task.is_cancelled()) {
				if (this.is_interrupted()) {
					await this._sleep();
					continue;
				}

				if (!character.is_fully_healed() && !character.skills.regen_hp.is_autouse()) {
					character.skills.regen_hp.autouse(null, null, () => !character.is_fully_healed());
				} else if (!character.is_fully_charged() && !character.skills.regen_mp.is_autouse()) {
					character.skills.regen_mp.autouse(null, null, () => !character.is_fully_charged());
				}

				await Util.sleep(1000);
			}
		});
	}

	/**
	 * Single step of brain logic.
	 */
	async _step() {
		await this._collect();
		await this._upgrade();
		await this._exchange();
		await this._bank();
		await this._vend();

		await movement.smarter_move('town');
		await this._sleep();
	}

	/** Collect items from other characters. */
	async _collect() {
		for (let char of Adventure.get_characters()) {
			if (char.name === character.name || !char.online) {
				continue;
			}

			const server = window.server.region + window.server.id;
			if (char.server !== server) {
				// Not on this sever!
				continue;
			}

			Logging.info(`Collecting from ${char.name}`);
			window.set_message('Collect');
			await this.loop_until_interrupted(async () => {
				if (Entity.get_entities({name: char.name}).length !== 0) {
					// Found character
					return false;
				}

				const c = Adventure.get_characters().find((c) => c.name === char.name && c.online);
				if (!c || c.server !== server) {
					// Character now offline or changed server
					return false;
				}

				await movement.smarter_move({x: char.x, y: char.y, map: char.map});
			})
		}
	}

	/** Upgrade the merch! */
	async _upgrade() {
		const upgradable = new Set();
		const compoundable = new Set();
		for (let [i, item] of Item.indexed_items()) {
			const item_id = item.name;
			if (is_upgradeable(item_id)) {
				upgradable.add(item_id);
			} else if (is_compoundable(item_id)) {
				compoundable.add(item_id);
			}
		}

		if (upgradable.size < 1 && compoundable.size < 1) {
			// Nothing to upgrade
			return;
		}

		if (upgradable.size > 0) {
			Logging.info('Upgrading items');
			window.set_message('Upgrade');

			for (let item_id of upgradable) {
				await Item.upgrade_all(item_id, MAX_UPGRADE[item_id] || DEFAULT_MAX_UPGRADE);
			}
		}

		if (compoundable.size > 0) {
			Logging.info('Compounding items');
			window.set_message('Compound');

			for (let item_id of compoundable) {
				await Item.compound_all(item_id, MAX_COMPOUND[item_id] || DEFAULT_MAX_COMPOUND);
			}
		}
	}

	/** Exchange items for goodies! */
	async _exchange() {
		const exchangeable = Item.indexed_items().filter(([_, item]) => G.items[item.name].e);
		if (exchangeable.length < 1) {
			return;
		}

		Logging.info('Exchanging items');
		window.set_message('Exchange');
		await movement.smarter_move('exchange');
		for (let [i, item] of exchangeable) {
			Logging.info(`Exchanging ${G.items[item.name].name}`);
			exchange(i);

			// FIXME: Wait until exchange is complete
			await this._sleep(5000);
		}
	}

	/** Unload at the bank. */
	async _bank() {
		Logging.info('Banking items');
		window.set_message('Bank');

		await movement.smarter_move('bank');
		await Adventure.transport('bank');

		for (let [i, item] of Item.indexed_items()) {
			const bank = bank_sort(item.name);
			if (!bank) {
				continue;
			}

			Adventure.bank_store(i, bank);
		}

		// Wait for the game to catch up...
		await Util.sleep(1000);

		// Do stocktake
		this._stocktake();

		// Pick up items
		this._retrieve_upgradeable();
		this._retrieve_compoundable();

		// Leave bank
		const door = G.maps['bank'].doors.find((d) => d[4] === 'main');
		await Adventure.transport('main', door[5]);
	}

	/** Retrieve upgradable items. */
	_retrieve_upgradeable() {
		let free_slot = -1;
		for (let [item_id, items] of this.stock.entries()) {
			if (!is_upgradeable(item_id)) {
				continue;
			}

			for (let [pack, i, item] of items) {
				if (item.level >= (MAX_UPGRADE[item_id] || DEFAULT_MAX_UPGRADE)) {
					break;
				}

				// Retrieve item
				free_slot = find_free_inventory_slot(free_slot);
				if (free_slot == -1) {
					break;
				}

				Adventure.bank_retrieve(pack, i, free_slot);
			}
		}
	}

	/** Retrieve compoundable items. */
	_retrieve_compoundable() {
		let free_slot = -1;
		for (let [item_id, items] of this.stock.entries()) {
			if (!is_compoundable(item_id)) {
				continue;
			}

			// Group by item level
			const by_level = []
			for (let [storage, storage_slot, item] of items) {
				if (item.level >= (MAX_COMPOUND[item_id] || DEFAULT_MAX_COMPOUND)) {
					break;
				}

				if (!(item.level in by_level)) {
					by_level[item.level] = [];
				}

				by_level[item.level].push([storage, storage_slot, item]);
			}

			// Work out how many items will bubble up a level
			const bubble_up = [];
			for (let level = 0; level < by_level.length; level++) {
				if (!(level in by_level)) {
					continue;
				}

				// How many new items might we have compounded?
				bubble_up[level] = Math.floor((by_level[level].length + (bubble_up[level - 1] || 0)) / N_COMPOUNDED);

				// Retrieve items
				for (let i = 0; i < Math.min(N_COMPOUNDED * bubble_up[level], by_level[level].length); i++) {
					free_slot = find_free_inventory_slot(free_slot);
					if (free_slot == -1) {
						break;
					}

					const [storage, storage_slot, _] = by_level[level][i];
					Adventure.bank_retrieve(storage, storage_slot, free_slot);
				}
			}
		}
	}

	/** Do stocktake. */
	_stocktake() {
		this.stock = stocktake();
		this.last_stocktake = new Date();
	}

	/** Vendor some goods. */
	async _vend() {
		Logging.info('Vending items');
		window.set_message('Vending');
		await movement.smarter_move(this.home);

		// Set up shop
		let until = new Date(Date.now() + 900_000);  // +15 minutes
		Logging.info('Vending until', until);

		this.open_stand();
		await Util.sleep_until(until);
		this.close_stand();

	}

	open_stand() {
		// TODO: Upstream to runner_functions.js
		parent.open_merchant(Item.find({name: 'stand0'}));
	}

	close_stand() {
		// TODO: Upstream to runner_functions.js
		parent.close_merchant();
	}
}

/**
 * Find empty inventory slot.
 *
 * @param {number} [after=-1] Find the next empty slot after this one.
 * @returns {number} Inventory index or -1 if no space available.
 */
function find_free_inventory_slot(after) {
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
 * Is this item upgradeable?
 *
 * @param {string} item_id Item ID (e.g. "helm")
 */
function is_upgradeable(item_id) {
	return 'upgrade' in G.items[item_id];
}

/**
 * Is this item upgradeable?
 *
 * @param {string} item_id Item ID (e.g. "helm")
 */
function is_compoundable(item_id) {
	return 'compound' in G.items[item_id];
}

/**
 * Decide which bank slot an item should go in.
 *
 * @param {string} item_id Item ID (e.g. "hpbelt").
 * @returns {string} Bank "pack".
 */
function bank_sort(item_id) {
	const details = G.items[item_id];
	if (!details) {
		return null;
	}

	if (details.upgrade) {
		return UPGRADE_PACK;
	}

	if (details.compound) {
		return COMPOUND_PACK;
	}

	switch (details.type) {
		case 'material':
		case 'quest':
			return MATERIAL_PACK;
	}

	// No idea!
	return null;
}

/**
 * Take stock of what's in the bank.
 *
 * @returns {Map<String,Array<[string,number,Item]>>} Mapping of `"item_id[:level]"` to Array of `[pack, index, item]`.
 */
function stocktake() {
	if (character.map !== 'bank') {
		throw new Error('Not in bank');
	}

	const stock = new Map();
	for (let [pack_name, pack] of Object.entries(character.bank)) {
		if (pack_name === "gold") {
			continue;
		}

		for (let i=0; i< pack.length; i++) {
			if (!pack[i]) {
				continue;
			}

			const item_id = pack[i].name;
			if (!stock.has(item_id)) {
				stock.set(item_id, []);
			}

			stock.get(item_id).push([pack_name, i, pack[i]]);
		}
	}

	// Sort each set of items by level
	for (let items of stock.values()) {
		items.sort(([_p1, _i1, item1], [_p2, _i2, item2]) => 'level' in item1 ? item1.level - item2.level : 0);
	}

	return stock;
}
