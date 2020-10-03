// Brain for a merchant
// @ts-check
import * as Adventure from '/adventure.js';
import * as Bank from '/bank.js';
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Item from '/item.js';
import * as Logging from '/logging.js';
import * as Movement from '/movement.js';
import * as Task from '/task.js';
import * as UI from '/ui.js';
import * as Util from '/util.js';

// Brain
import { Brain } from '/brain/brain.js';

// Number of items required to compound
const N_COMPOUNDED = 3;

// Highest levels to upgrade/compound to
const MAX_UPGRADE = {
	'cclaw': 6,
	'fireblade': 5,
	'firestaff': 4,
	'gloves1': 5,
	'helmet': 5,
	'helmet1': 5,
	'mace': 6,
	'quiver': 5,
	'shoes': 5,
	'wattire': 5,
	'wcap': 6,
	'wshoes': 6,
}
const MAX_COMPOUND = {
	'hpbelt': 3,
	'hpamulet': 3,
	'ringsj': 3,
	'dexearring': 2,
	'intearring': 2,
	'strearring': 2,
	'vitearring': 2,
}
const DEFAULT_MAX_UPGRADE = 0;
const DEFAULT_MAX_COMPOUND = 0;

// Bank packs
const MATERIAL_PACK = 'items0';
const UPGRADE_PACK = 'items0';
const COMPOUND_PACK = 'items1';

// Misc
const MAX_GOLD = 1_000_000;
const DEFAULT_VENDING_DURATION = 15 * Util.MINUTE_MS;
const MLUCK_MIN_MS = 58 * Util.MINUTE_MS;  // Every 2 minutes

const character = Character.get_character();
const movement = Movement.get_movement();

export class MerchantBrain extends Brain {
	constructor() {
		super();

		this.home = {x: -120, y: 0, map: 'main'};  // Home for vending
		this.stock = null;  // Track bank contents
		this.vending_duration = DEFAULT_VENDING_DURATION;
		this.tasks = {};

		this.should_bank = false;
		this.should_collect = false;

		// States
		this.states = [
			{name: 'Compound', predicate: () => this.items_to_compound().length >= 1},
			{name: 'Upgrade', predicate: () => this.items_to_upgrade().length >= 1},
			{name: 'Exchange', predicate: () => this.items_to_exchange().length >= 1},
			{name: 'Bank', predicate: () => this.should_bank},
			{name: 'Collect', predicate: () => this.should_collect},
			{name: 'Vend'},
		]
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
		this.tasks['regen_autocast'] = Task.create(async (task) => {
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
		this.tasks['mluck'] = Task.create(async (task) => {
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

				for (let char of Entity.get_entities({type: 'character'})) {
					// Should we cast on this character?
					// Don't cast on other merchants, since this tends to start a buff-war
					if (char.npc || char.ctype === 'merchant' || Entity.distance_between(character, char) > G.skills.mluck.range) {
						continue;
					}

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
		this.tasks['party'] = Task.create(async (task) => {
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

	/** Collect items from other characters. */
	async _collect() {
		if (!this.should_collect) {
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

				await UI.busy('Collect', movement.pathfind_move({x: c.x, y: c.y, map: c.map}, {range: 250}, {avoid: true}));
			}
		}

		// Warp back to town
		await character.town();

		this.should_collect = false;
		this.should_bank = true;
	}

	/** Upgrade the merch! */
	async _upgrade() {
		const upgradeable = this.items_to_upgrade();
		if (upgradeable.length < 1) {
			Logging.warn('Nothing to upgrade?');
			return;
		}

		const item = upgradeable[0][1];
		await upgrade_all(item.name, MAX_UPGRADE[item.name] || DEFAULT_MAX_UPGRADE);

		this.should_bank = true;
	}

	items_to_upgrade() {
		return Item.indexed_items({upgradeable: true})
			.filter(([_, item]) => item.level < (MAX_UPGRADE[item.name] || DEFAULT_MAX_UPGRADE));
	}

	/** Compound items! */
	async _compound() {
		const compoundable = this.items_to_compound();
		if (compoundable.length < 1) {
			Logging.warn('Nothing to compound?');
			return;
		}

		const set = compoundable[0];
		await compound_all(set.name, MAX_COMPOUND[set.name] || DEFAULT_MAX_COMPOUND);

		this.should_bank = true;
	}

	items_to_compound() {
		const to_compound = [];
		const counts = new Map();
		for (let [slot, item] of Item.indexed_items({ compoundable: true })
			.filter(([_, item]) => item.level < (MAX_COMPOUND[item.name] || DEFAULT_MAX_COMPOUND))) {
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

		this.should_bank = true;
	}

	items_to_exchange() {
		return Item.indexed_items({exchangeable: true});
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
		if (character.gold > MAX_GOLD) {
			window.bank_deposit(character.gold - MAX_GOLD);
		}

		// Store items
		for (let [i, item] of Item.indexed_items()) {
			const bank = pick_account(item);
			if (!bank) {
				continue;
			}
			window.bank_store(i, bank);
		}

		// Sort items
		for (let name of Bank.accounts().keys()) {
			await Bank.sort_account(name);
		}

		// Do stocktake
		this._stocktake();

		// Pick up items
		await this._retrieve_upgradeable();
		await this._retrieve_compoundable();
		await this._retrieve_exchangeable();

		this.should_bank = false;
	}

	/** Retrieve upgradable items. */
	async _retrieve_upgradeable() {
		const to_upgrade = [];
		for (let items of this.stock.values()) {
			for (let [pack, pack_slot, item] of items) {
				if (!Item.is_upgradeable(item) || item.level >= (MAX_UPGRADE[item.name] || DEFAULT_MAX_UPGRADE)) {
					continue;
				}

				to_upgrade.push([pack, pack_slot]);
			}
		}

		await Item.retrieve_items(to_upgrade);
	}

	/** Retrieve compoundable items. */
	async _retrieve_compoundable() {
		const to_compound = [];
		for (let items of this.stock.values()) {
			// Group by item level
			const by_level = []
			for (let [pack, pack_slot, item] of items) {
				if (!Item.is_compoundable(item) || item.level >= (MAX_COMPOUND[item.name] || DEFAULT_MAX_COMPOUND)) {
					continue;
				}

				if (!(item.level in by_level)) {
					by_level[item.level] = [];
				}

				by_level[item.level].push([pack, pack_slot, item]);
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
					const [storage, storage_slot, _] = by_level[level][i];
					to_compound.push([storage, storage_slot]);
				}
			}
		}

		await Item.retrieve_items(to_compound);
	}

	/** Retrieve exchangeable items. */
	async _retrieve_exchangeable() {
		const to_exchange = [];
		for (let items of this.stock.values()) {
			for (let [pack, pack_slot, item] of items) {
				if (!Item.is_exchangeable(item)) {
					continue;
				}

				to_exchange.push([pack, pack_slot]);
			}
		}

		await Item.retrieve_items(to_exchange);
	}

	/** Do stocktake. */
	_stocktake() {
		this.stock = stocktake();
		this.last_stocktake = new Date();
	}

	/** Vendor some goods. */
	async _vend() {
		Logging.info('Vending items');
		await movement.pathfind_move(this.home);

		// Set up shop
		this.open_stand();
		await this.countdown(Util.date_add(this.vending_duration), this.state_name);
		this.close_stand();

		this.should_collect = true;
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
			let i_scroll = Item.find({name: scroll_});
			if (i_scroll === -1 || character.items[i_scroll].q < 1) {
				// Need more scrolls
				await window.buy_with_gold(scroll_, 5);
				i_scroll = Item.find({name: scroll_});
			}

			try {
				Logging.info(`Compounding ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
				await UI.busy('Compound', window.compound(i_items[i][0], i_items[i+1][0], i_items[i+2][0], i_scroll));
			} catch (e) {
				Logging.warn('Compounding failed', e);
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
	await movement.pathfind_move('upgrade');

	for (let level=0; level<max_level; level++) {
		const scroll_ = scroll ? scroll : `scroll${Item.scroll_level(name, level)}`;
		const i_items = Item.indexed_items({name: name, level: level});

		// Upgrade!
		for (let i=0; i<i_items.length; i++) {
			let i_scroll = Item.find({name: scroll_});
			if (i_scroll === -1 || character.items[i_scroll].q < 1) {
				// Need more scrolls
				await window.buy_with_gold(scroll_, 5);
				i_scroll = Item.find({name: scroll_});
			}

			try {
				Logging.info(`Upgrading ${G.items[name].name} (${level} to ${level+1}) ${scroll_}`);
				await UI.busy('Upgrade', window.upgrade(i_items[i][0], i_scroll));
			} catch (e) {
				Logging.warn('Upgrading failed', e);
			}
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
