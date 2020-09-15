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
const DEFAULT_MAX_UPGRADE = 0;
const DEFAULT_MAX_COMPOUND = 0;

// Bank packs
const UPGRADE_PACK = 'items0';
const COMPOUND_PACK = 'items1';
const MATERIAL_PACK = 'items1';

// Misc
const DEFAULT_VENDING_DURATION = 15 * Util.MINUTE_MS;

const character = Character.get_character();
const movement = Movement.get_movement();

export class MerchantBrain extends Brain {
	constructor() {
		super();

		this.home = {x: -120, y: 0, map: 'main'};  // Home for vending
		this.stock = null;  // Track bank contents
		this.vending_duration = DEFAULT_VENDING_DURATION;
		this.tasks = {};

		// States
		this.states = {
			Collect: {next: 'Upgrade'},
			Upgrade: {next: 'Exchange'},
			Exchange: {next: 'Bank'},
			Bank: {next: 'Vend'},
			Vend: {next: 'Collect'},
		}

		// Default state is Collect
		this.brain_state.state = this.brain_state.state in this.states ? this.brain_state.state : 'Collect';
	}

	get state_name() {
		return this.brain_state.state;
	}

	get _state() {
		return this[`_${this.brain_state.state.toLowerCase()}`];
	}

	async _init() {
		Logging.info('Starting Merchant brain');
		window.set_message('Merchant');

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
		// Close our stand if it was open
		this.close_stand();

		window.set_message(this.brain_state.state);
		const state = this.states[this.brain_state.state];
		await this._state();
		this.brain_state.state = state.next;
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

				try {
					await movement.smarter_move({x: char.x, y: char.y, map: char.map}, {range: 250}, {avoid: true});
				} catch (e) {
					Logging.warn(`Moving to ${char.name} failed`, e);
				}
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
				await upgrade_all(item_id, MAX_UPGRADE[item_id] || DEFAULT_MAX_UPGRADE);
			}
		}

		if (compoundable.size > 0) {
			Logging.info('Compounding items');
			window.set_message('Compound');

			for (let item_id of compoundable) {
				await compound_all(item_id, MAX_COMPOUND[item_id] || DEFAULT_MAX_COMPOUND);
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

		await movement.smarter_move('bank');
		await Adventure.transport('bank');

		for (let [i, item] of Item.indexed_items()) {
			const bank = bank_sort(item.name);
			if (!bank) {
				continue;
			}

			window.bank_store(i, bank);
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

				window.bank_retrieve(pack, i, free_slot);
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
					window.bank_retrieve(storage, storage_slot, free_slot);
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
		await movement.smarter_move(this.home);

		// Set up shop
		this.open_stand();
		await this.countdown(Util.date_add(this.vending_duration), this.state_name);
		this.close_stand();
	}

	open_stand() {
		// TODO: Upstream to runner_functions.js
		window.open_merchant(Item.find({name: 'stand0'}));
	}

	close_stand() {
		// TODO: Upstream to runner_functions.js
		window.close_merchant();
	}
}

/**
 * Compound all of a certain type of item.
 *
 * @param {string} name Name of item (e.g. "hpamulet").
 * @param {number} max_level Maximum level to compound to.
 * @param {string} [scroll] Combining scroll (default: auto).
 */
async function compound_all(name, max_level, scroll) {
	await movement.smarter_move('compound');
	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `cscroll${Item.scroll_level(name, level)}`;
		const i_scrolls = Item.indexed_items({name: scroll_});
		const i_items = Item.indexed_items({name: name, level: level});

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
async function upgrade_all(name, max_level, scroll) {
	await movement.smarter_move('upgrade');

	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `scroll${Item.scroll_level(name, level)}`;
		const i_scrolls = Item.indexed_items({name: scroll_});
		const i_items = Item.indexed_items({name: name, level: level});

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
