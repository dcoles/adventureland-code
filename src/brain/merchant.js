// Brain for a merchant
// @ts-check
import * as Adventure from '/adventure.js';
import * as Bank from '/bank.js';
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Item from '/item.js';
import * as Logging from '/logging.js';
import * as Movement from '/movement.js';
import * as UI from '/ui.js';
import * as Util from '/util.js';

// Brain
import { Brain } from '/brain/brain.js';

// Number of items required to compound
const N_COMPOUNDED = 3;

// Highest levels to upgrade/compound to
const DEFAULT_MAX_UPGRADE = 0;
const DEFAULT_MAX_COMPOUND = 0;
const MAX_SCROLL_LEVEL = 1;  // Don't upgrade rare items (too expensive!)
const MAX_GRADE = Item.Grade.HIGH;

// Bank packs
const MATERIAL_PACK = 'items0';
const UPGRADE_PACK = 'items0';
const COMPOUND_PACK = 'items1';
const DONT_STORE_TYPES = new Set(['stand', 'uscroll', 'cscroll', 'pscroll', 'gem']);

// Misc
const TARGET_GOLD = 2_500_000;
const MIN_GOLD = 1_000_000;
const DEFAULT_VENDING_DURATION = 15 * Util.MINUTE_MS;
const MLUCK_MIN_MS = G.conditions.mluck.duration - Util.MINUTE_MS;  // Once per minute

const character = Character.get_character();
const movement = Movement.get_movement();

export class MerchantBrain extends Brain {
	constructor() {
		super();

		this.home = {x: -120, y: 0, map: 'main'};  // Home for vending
		this.vending_duration = DEFAULT_VENDING_DURATION;

		this.state.should_bank ??= false;
		this.state.should_collect ??= false;

		// States
		this.states = [
			{name: 'Compound', predicate: () => this.items_to_compound().length >= 1 && character.gold > MIN_GOLD},
			{name: 'Upgrade', predicate: () => this.items_to_upgrade().length >= 1 && character.gold > MIN_GOLD},
			{name: 'Exchange', predicate: () => this.items_to_exchange().length >= 1},
			{name: 'Bank', predicate: () => this.state.should_bank},
			{name: 'Collect', predicate: () => this.state.should_collect},
			{name: 'Vend'},
		]

		this.data = {};
	}

	get state_name() {
		return this.state.name;
	}

	get _current_state() {
		return this[`_${this.state.name.toLowerCase()}`];
	}

	async _init() {
		// Default state is Collect
		this.state.name = this.state.name in this.states ? this.state.name : 'Collect';

		// Task for keeping us healthy
		this.create_task('regen_autocast', async task => {
			const regulator = new Util.Regulator(Util.SECOND_MS);
			while (!task.is_cancelled()) {
				// Ensure we don't spin too fast
				await regulator.regulate();

				if (this.is_interrupted()) {
					continue;
				}

				if (!character.is_fully_healed() && !character.skills.regen_hp.is_autouse()) {
					character.skills.regen_hp.autouse(null, null, () => !character.is_fully_healed());
				} else if (!character.is_fully_charged() && !character.skills.regen_mp.is_autouse()) {
					character.skills.regen_mp.autouse(null, null, () => !character.is_fully_charged());
				}
			}
		});

		// Task for casting Merchant's Luck
		this.create_task('mluck', async task => {
			const regulator = new Util.Regulator(Util.SECOND_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();

				if (this.is_interrupted()) {
					continue;
				}

				// Can we use this skill yet?
				if (character.level < G.skills.mluck.level) {
					continue;
				}

				for (let char of Entity.get_entities({type: 'character', max_distance: G.skills.mluck.range, npc: false}, true)) {
					// Do they have a recent buff from us (or a strong buff)?
					if (char.s.mluck && (char.s.mluck.ms > MLUCK_MIN_MS || (char.s.mluck.strong && char.s.mluck.f !== character.name))) {
						continue;
					}

					Logging.info(`Casting Merchant's luck on ${char.name}`);
					await character.skills.mluck.use_when_ready(char);
				}
			}
		});

		// Task for joining parties
		this.create_task('party', async task => {
			const regulator = new Util.Regulator(Util.SECOND_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();

				if (this.is_interrupted()) {
					continue;
				}

				// Join party of our nearby characters
				for (let char of Entity.get_entities({owner: true})) {
					if (char.party && character.party !== char.party) {
						window.send_party_request(char.party);
						break;
					}
				}
			}
		});

		// Task for updating merchant data
		this.create_task('update_data', async task => {
			const regulator = new Util.Regulator(Util.MINUTE_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();

				Logging.info('Updating merchant data');
				const url = new URL('/data/merchant.json', import.meta.url);
				const response = await fetch(url);
				try {
					this.data = await response.json();
				} catch (e) {
					Logging.error('Failed to update data', e);
				}
				Logging.debug('Merchant data', this.data);
			}
		})
	}

	/**
	 * Single step of brain logic.
	 */
	async _step() {
		// Close our stand if it was open
		this.close_stand();

		for (let state of this.states) {
			if (state.predicate && !state.predicate()) {
				continue;
			}

			this.state.name = state.name;
			window.set_message(state.name);
			await this._current_state();
			return;
		}

		Logging.error('No states found!')
		this.stop();
	}

	/** Compound items! */
	async _compound() {
		const compoundable = this.items_to_compound();
		if (compoundable.length < 1) {
			Logging.warn('Nothing to compound?');
			return;
		}

		const set = compoundable[0];
		try {
			await compound_all(set.name, this.max_compound(set));
		} catch (e) {
			switch (e.reason) {
				case 'cost':
					break;
				default:
					throw e;
			}
		}

		this.state.should_bank = true;
	}

	items_to_compound() {
		const to_compound = [];
		const counts = new Map();
		for (let [slot, item] of Item.indexed_items({ compoundable: true })
			.filter(([_, item]) => item.level < this.max_compound(item) && Item.scroll_level(item.name, item.level) <= MAX_SCROLL_LEVEL)) {
			const key = `${item.name}@${item.level}`;
			if (!counts.has(key)) {
				counts.set(key, {name: item.name, level: item.level, slots: []});
			}

			const set = counts.get(key);
			set.slots.push(slot);

			if (set.slots.length == 3) {
				to_compound.push(set);
				counts.delete(key);
			}
		}

		return to_compound;
	}

	max_compound(item) {
		return this.data.max_compound?.[item.name] ?? DEFAULT_MAX_COMPOUND;
	}

	/** Upgrade the merch! */
	async _upgrade() {
		const upgradeable = this.items_to_upgrade();
		if (upgradeable.length < 1) {
			Logging.warn('Nothing to upgrade?');
			return;
		}

		const item = upgradeable[0][1];
		try {
			await upgrade_all(item.name, this.max_upgrade(item));
		} catch (e) {
			switch (e.reason) {
				case 'cost':
					break;
				default:
					throw e;
			}
		}

		this.state.should_bank = true;
	}

	items_to_upgrade() {
		return Item.indexed_items({upgradeable: true})
			.filter(([_, item]) => item.level < this.max_upgrade(item) && Item.scroll_level(item.name, item.level) <= MAX_SCROLL_LEVEL);
	}

	max_upgrade(item) {
		return this.data.max_upgrade?.[item.name] ?? DEFAULT_MAX_UPGRADE;
	}

	/** Exchange items for goodies! */
	async _exchange() {
		const exchangeable = this.items_to_exchange();
		if (exchangeable.length < 1) {
			Logging.warn('Nothing to exchange?');
			return;
		}

		const [slot, item] = exchangeable[0];
		const item_details = G.items[item.name];
		const npc_id = Item.npc_for_quest(item_details.quest);

		Logging.info(`Exchanging ${item_details.name} with ${G.npcs[npc_id].name}`);
		try {
			await movement.pathfind_move(npc_id);
		} catch (e) {
			// Couldn't find them?
			Logging.warn(`Couldn't move to NPC ${G.npcs[npc_id].name}`, e);
			return;
		}

		while (character.items[slot] && character.items[slot].name == item.name && character.items[slot].q >= item_details.e) {
			// Wait until exchanging the previous item completes
			if (window.character.q.exchange) {
				await UI.busy('Exchange', this._sleep(window.character.q.exchange.ms));
			}

			exchange(slot);
			await this._idle();
		}

		this.state.should_bank = true;
	}

	items_to_exchange() {
		return Item.indexed_items({exchangeable: true})
			.filter(([_, item]) => !item.name.startsWith('candy'));
	}

	/** Unload at the bank. */
	async _bank() {
		Logging.info('Banking items');
		while (!character.bank) {
			if (this.is_interrupted()) {
				return;
			}

			await movement.pathfind_move('bank');
		}

		// Deposit excess gold
		if (character.gold > TARGET_GOLD) {
			window.bank_deposit(character.gold - TARGET_GOLD);
		} else if (character.gold < TARGET_GOLD) {
			window.bank_withdraw(TARGET_GOLD - character.gold);
		}

		// Pick up items
		await this._retrieve_compoundable();
		await this._retrieve_upgradeable();
		await this._retrieve_exchangeable();

		// Deposit items
		try {
			await this._store_items();
		} catch (e) {
			Logging.warn('Failed to store items', e);
		}

		// Sort items
		for (let name of Bank.accounts().keys()) {
			await Bank.sort_account(name);
		}

		this.state.should_bank = false;
	}

	/** Retrieve upgradable items. */
	async _retrieve_upgradeable() {
		const slots = character.items.map((item, i) => [i, item]).filter(([_, item]) => !item || this.should_store(item)).map(([i, _]) => i);
		const bank_slots = Item.bank_indexed_items().filter(([_, item]) => this.should_upgrade(item));

		// Swap slots
		const n = Math.min(slots.length, bank_slots.length);
		for (let i = 0; i < n; i++) {
			await Item.swap({slot: slots[i]}, bank_slots[i][0]);
		}
	}

	/** Retrieve compoundable items. */
	async _retrieve_compoundable() {
		const slots = character.items.map((item, i) => [i, item]).filter(([_, item]) => !item || this.should_store(item)).map(([i, _]) => i);
		const character_slots = Item.character_indexed_items().filter(([_, item]) => this.should_compound(item));
		const bank_slots = Item.bank_indexed_items().filter(([_, item]) => this.should_compound(item));

		// Count up sets in inventory
		const counts = new Map();
		for (let [_, item] of character_slots) {
			const key = Item.key(item);
			if (!counts.has(key)) {
				counts.set(key, 0);
			}

			counts.set(key, counts.get(key) + 1);
		}

		// Look for full sets in bank
		const to_retrieve = [];
		const sets = new Map();
		for (let [location, item] of bank_slots) {
			const key = Item.key(item);
			if (!counts.has(key)) {
				counts.set(key, 0);
			}

			if (!sets.has(key)) {
				sets.set(key, [])
			}

			sets.get(key).push(location);
			counts.set(key, counts.get(key) + 1);

			if (counts.get(key) % N_COMPOUNDED === 0) {
				to_retrieve.push(...sets.get(key));
				sets.delete(key);
			}
		}

		// Swap slots
		for (let i = 0; i < Math.min(to_retrieve.length, slots.length); i++) {
			await Item.swap({slot: slots[i]}, to_retrieve[i]);
		}
	}

	/** Retrieve exchangeable items. */
	async _retrieve_exchangeable() {
		const slots = character.items.map((item, i) => [i, item]).filter(([_, item]) => !item || this.should_store(item)).map(([i, _]) => i);
		const bank_slots = Item.bank_indexed_items().filter(([_, item]) => this.should_exchange(item));

		// Swap slots
		const n = Math.min(slots.length, bank_slots.length);
		for (let i = 0; i < n; i++) {
			await Item.swap({slot: slots[i]}, bank_slots[i][0]);
		}
	}

	/** Store excess items */
	async _store_items() {
		for (let [i, item] of Item.indexed_items().filter(([_, item]) => this.should_store(item))) {
			const account = pick_account(item);
			if (account) {
				await Item.store(i, account);
			}
		}
	}

	/**
	 * Should we store this item in the bank?
	 *
	 * @param {Item} item
	 * @returns {boolean}
	 */
	should_store(item) {
		const item_type = G.items[item.name].type;
		return !this.should_upgrade(item) && !this.should_compound(item) && !this.should_exchange(item) && !DONT_STORE_TYPES.has(item_type);
	}

	/**
	 * Should we upgrade this item?
	 *
	 * @param {Item} item
	 * @returns {boolean}
	 */
	should_upgrade(item) {
		return Item.is_upgradeable(item) && item.level < this.max_upgrade(item) && Item.grade(item) < MAX_GRADE;
	}

	/**
	 * Should we upgrade this item?
	 *
	 * @param {Item} item
	 * @returns {boolean}
	 */
	should_compound(item) {
		return Item.is_compoundable(item) && item.level < this.max_compound(item) && Item.grade(item) < MAX_GRADE;
	}

	/**
	 * Should we upgrade this item?
	 *
	 * @param {Item} item
	 * @returns {boolean}
	 */
	should_exchange(item) {
		return Item.is_exchangeable(item) && !item.name.startsWith('candy');
	}

	/** Collect items from other characters. */
	async _collect() {
		if (!this.state.should_collect) {
			return;
		}

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
			const regulator = new Util.Regulator(Util.SECOND_MS);
			while (Entity.get_entities({name: char.name}).length === 0) {
				await regulator.regulate();

				if (this.is_interrupted()) {
					return;
				}

				const c = Brain.get_character(char.name);
				if (!c.online || c.server !== server) {
					break;
				}

				await movement.pathfind_move({x: c.x, y: c.y, map: c.map}, {range: 250}, {avoid: true});
			}
		}

		// Warp back to town
		await character.town();

		this.state.should_collect = false;
		this.state.should_bank = true;
	}

	/** Vendor some goods. */
	async _vend() {
		Logging.info('Vending items');
		await movement.pathfind_move(this.home);

		// Set up shop
		this.open_stand();
		await this.countdown(Util.date_add(this.vending_duration), this.state_name);
		this.close_stand();

		this.state.should_collect = true;
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
	await movement.pathfind_move('compound');
	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `cscroll${Item.scroll_level(name, level)}`;
		const i_items = Item.indexed_items({name: name, level: level});

		// Combine!
		for (let i=0; i<i_items.length-2; i+=3) {
			let need = 1;
			do {
				let i_scroll = Item.find({name: scroll_});
				if (i_scroll === -1 || character.items[i_scroll].q < need) {
					// Need more scrolls
					await window.buy_with_gold(scroll_, need);
					i_scroll = Item.find({name: scroll_});
				}

				try {
					Logging.info(`Compounding ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
					await UI.busy('Compound', window.compound(i_items[i][0], i_items[i+1][0], i_items[i+2][0], i_scroll));
				} catch (e) {
					if (e.reason === 'scroll_quantity') {
						// Not enough scrolls
						need = e.need - e.have;
						continue;
					} else {
						Logging.warn('Compounding failed', e);
					}
				}

			} while (false)
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
	await movement.pathfind_move('upgrade');

	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `scroll${Item.scroll_level(name, level)}`;
		const i_items = Item.indexed_items({name: name, level: level});

		// Upgrade!
		for (let i=0; i<i_items.length; i++) {
			let need = 1;
			do {
				let i_scroll = Item.find({name: scroll_});
				if (i_scroll === -1 || character.items[i_scroll].q < need) {
					// Need more scrolls
					await window.buy_with_gold(scroll_, need);
					i_scroll = Item.find({name: scroll_});
				}

				try {
					Logging.info(`Upgrading ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
					await UI.busy('Upgrade', window.upgrade(i_items[i][0], i_scroll));
				} catch (e) {
					if (e.reason === 'scroll_quantity') {
						// Not enough scrolls
						need = e.need - e.have;
						continue
					} else {
						Logging.warn('Upgrading failed', e);
					}
				}
			} while (false)
		}
	}
}

/**
 * Decide which bank slot an item should go in.
 *
 * @param {Item} item Item ID (e.g. "hpbelt").
 * @returns {string} Bank "pack".
 */
function pick_account(item) {
	const details = G.items[item.name];
	if (!details) {
		return null;
	}

	if (Item.is_upgradeable(item)) {
		return UPGRADE_PACK;
	}

	if (Item.is_compoundable(item)) {
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
	for (let [account_name, account] of Bank.accounts().entries()) {
		for (let i=0; i< account.length; i++) {
			if (!account[i]) {
				continue;
			}

			const item_id = account[i].name;
			if (!stock.has(item_id)) {
				stock.set(item_id, []);
			}

			stock.get(item_id).push([account_name, i, account[i]]);
		}
	}

	// Sort each set of items by level
	for (let items of stock.values()) {
		items.sort(([_p1, _i1, item1], [_p2, _i2, item2]) => 'level' in item1 ? item1.level - item2.level : 0);
	}

	return stock;
}
