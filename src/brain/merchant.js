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
	'helmet1': 5,
	'mace': 6,
	'shoes': 5,
	'wshoes': 6,
	'wcap': 6,
	'wattire': 5,
	'quiver': 5,
	'fireblade': 5,
	'firestaff': 4,
}
const MAX_COMPOUND = {
	'ringsj': 3,
	'hpbelt': 3,
	'hpamulet': 3,
	'dexearring': 1,
	'intearring': 1,
	'vitearring': 1,
	'strearring': 1,
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

		this.should_collect = true;
		this.should_vend = true;

		// States
		this.states = {
			Collect: {next: 'Upgrade'},
			Upgrade: {next: 'Compound'},
			Compound: {next: 'Exchange'},
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

		window.set_message(this.brain_state.state);
		const state = this.states[this.brain_state.state];
		await this._state();
		this.brain_state.state = state.next;
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

				await movement.pathfind_move({x: char.x, y: char.y, map: char.map}, {range: 250}, {avoid: true});
			})
		}

		// Warp back to town
		await character.town();
	}

	/** Upgrade the merch! */
	async _upgrade() {
		const upgradeable = Item.indexed_items({upgradeable: true});
		if (upgradeable.length < 1) {
			return;
		}

		Logging.info('Upgrading items');
		for (let [_, item] of upgradeable) {
			window.set_message('Upgrade');
			await upgrade_all(item.name, MAX_UPGRADE[item.name] || DEFAULT_MAX_UPGRADE);
		}
	}

	/** Compound items! */
	async _compound() {
		const compoundable = Item.indexed_items({compoundable: true});
		if (compoundable.length < 1) {
			return;
		}

		Logging.info('Compounding items');
		window.set_message('Compound');
		for (let [_, item] of compoundable) {
			await compound_all(item.name, MAX_COMPOUND[item.name] || DEFAULT_MAX_COMPOUND);
		}
	}

	/** Exchange items for goodies! */
	async _exchange() {
		const exchangeable = Item.indexed_items({exchangeable: true});
		if (exchangeable.length < 1) {
			return;
		}

		Logging.info('Exchanging items');
		const quests = new Map();
		for (let [id, npc] of Object.entries(G.npcs)) {
			if (!npc.quest || !find_npc(npc.quest)) {
				continue;
			}
			quests.set(npc.quest, id);
		}

		for (let [slot_num, item] of exchangeable) {
			const npc_id = quests.get(item.name) || 'exchange';
			Logging.info(`Exchanging ${G.items[item.name].name} with ${G.npcs[npc_id].name}`);
			try {
				await movement.pathfind_move(npc_id);
			} catch (e) {
				// Couldn't find them?
				Logging.warn(`Couldn't move to NPC ${G.npcs[npc_id].name}`, e);
				continue;
			}

			while (character.items[slot_num]) {
				if (window.character.q.exchange) {
					await this._sleep(window.character.q.exchange.ms);
				}

				exchange(slot_num);
				await this._idle();
			}
		}
	}

	/** Unload at the bank. */
	async _bank() {
		Logging.info('Banking items');
		await movement.pathfind_move('bank');

		// Deposit excess gold
		if (character.gold > MAX_GOLD) {
			window.bank_deposit(character.gold - MAX_GOLD);
		}

		// Store items
		for (let [i, item] of Item.indexed_items()) {
			const bank = bank_sort(item);
			if (!bank) {
				continue;
			}
			window.bank_store(i, bank);
		}

		// Wait for the game to catch up...
		await Util.sleep(250);

		// Do stocktake
		this._stocktake();

		// Pick up items
		await this._retrieve_upgradeable();
		await this._retrieve_compoundable();
		await this._retrieve_exchangeable();
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
		if (!this.should_vend) {
			return;
		}

		Logging.info('Vending items');
		await movement.pathfind_move(this.home);

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
				await window.compound(i_items[i][0], i_items[i+1][0], i_items[i+2][0], i_scroll);
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
				await window.upgrade(i_items[i][0], i_scroll);
			} catch (e) {
				Logging.warn('Upgrading failed', e.reason);
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
function bank_sort(item) {
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
