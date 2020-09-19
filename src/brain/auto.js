// Fully-automated brain
// @ts-check
import * as Adventure from '/adventure.js';
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Item from '/item.js';
import * as Logging from '/logging.js';
import * as Util from '/util.js';
import * as Movement from '/movement.js';

// Brain
import { Brain } from '/brain/brain.js';

// The #maincode
const maincode = Adventure.get_maincode();

// Character wrapper
const character = Character.get_character();

// Movment helper
const movement = Movement.get_movement();

const TICK_MS = 1000;
const HOME_RANGE_RADIUS = 500;
const MIN_DIFFICULTY = 0.1;
const MAX_DIFFICULTY = 9.0;
const MAX_GOLD = 500_000;  // Max gold before transfering
const PRIORITY_TARGETS = ['phoenix'];

export class AutoBrain extends Brain {
	constructor() {
		super();
		this.home = null;
		this.leader_name = null;
		this.priority_targets = new Set(PRIORITY_TARGETS);
	}

	/** Are we safe? */
	is_safe() {
		// Must either have more than 10% HP or we're within 100px of the map origin
		return Entity.hp_ratio(character) > 0.10 || character.distance(0, 0) < 100;
	}

	is_party_healable() {
		// Only priests can heal
		if (character.ctype !== 'priest') {
			return false;
		}

		// We need healing!
		if (Entity.hp_ratio(character) < 0.90) {
			return true;
		}

		// Does anyone need healing?
		for (let char of Entity.get_party_members()) {
			if (!char.rip && Entity.hp_ratio(char) < 0.90) {
				return true;
			}
		}

		return false;
	}

	/** Are we lost? */
	is_lost() {
		// We can only go missing if we have a leader
		if (!this.leader_name) {
			return false;
		}

		const leader = maincode.character;
		if (!leader) {
			return false;
		}

		const distance = character.distance_between(leader);
		return !distance || distance > 300;
	}

	/** Is our target alive? */
	is_target_alive() {
		return this.target && !this.target.dead;
	}

	/** Are we within our home range? */
	is_home() {
		if (!this.home) {
			return true;
		}

		return character.map === this.home.map
		&& character.distance(this.home.x, this.home.y) < HOME_RANGE_RADIUS;
	}

	/** Is our HP getting low? */
	is_low_hp() {
		return Entity.hp_ratio(character) < 0.30;  // Below 30%
	}

	/** Called on major state updates. */
	on_state(state) {
		Logging.debug('State', state);
		set_message(state);
	}

	/**
	 * Set character's home location.
	 *
	 * @param {object} [location] Location to set as home (default: current location).
	 * @returns {object} Home location set.
	 */
	set_home(location) {
		location = location || {x: character.x, y: character.y, map: character.map};

		Logging.info(`Setting home: ${Entity.location_to_string(location)}`);
		Adventure.set('home', location);
		this.home = location;

		return location;
	}

	/**
	 * Get character's current home location.
	 *
	 * @returns {object|null} Home location.
	 */
	get_home() {
		return Adventure.get('home');
	}

	async _init() {
		Logging.info('Starting Auto brain');

		// We might be a bot and not even know it!
		if (character.bot) {
			this.leader_name = maincode.character.name;

			// Join a party (and keep trying every 30s)
			this._join_party();
			window.setInterval(this._join_party, 30_000);
		} else {
			// Remember our home
			this.home = this.get_home();
			if (!this.home) {
				this.home = this.set_home();
			}

			Logging.info(`Home: ${Entity.location_to_string(this.home)}`);
			window.draw_circle(this.home.x, this.home.y, this.home.range, null, 0xffff00);
		}

		// Focus on attacker when hit
		character.on('hit', (data) => {
			if (data.damage > 0) {
				const attacker = get_entity(data.actor);
				if (this.target !== attacker) {
					Logging.warn('Attacked by', attacker ? attacker.name : '???');
					this.set_target(attacker);
					this.interrupt = true;
				}
			}
		});

		// Reoccuring timer
		setInterval(() => this._tick(), TICK_MS);

		// Initially we have no target
		change_target(null);
	}

	/** Try to join the party. */
	_join_party() {
		// Check if we're already in a party
		if (character.party) {
			return;
		}

		Adventure.send_party_request(this.leader_name);
	}

	/** Timer tick */
	_tick() {
		if (this.is_interrupted()) {
			return;
		}

		character.loot();
		this._update_autocasts();
		this._transfer_items();
	}

	/** Update the selected autocasts. */
	_update_autocasts() {
		const hp_ratio = character.hp / character.max_hp;
		const mp_ratio = character.mp / character.max_mp;

		let skill_id = null;
		let conditon = null;
		if (hp_ratio < 0.10) {  // below 10% HP
			// Critically low health
			skill_id = 'regen_hp';
			conditon = () => !character.is_fully_healed() && !this.is_interrupted();
		} else if (mp_ratio < 0.10) {  // below 10% MP
			// We need mana to cast!
			skill_id = 'regen_mp';
			conditon = () => !character.is_fully_charged() && !this.is_interrupted();
		} else if (hp_ratio < 1.00) {  // below 100% HP
			// Restore HP
			skill_id = 'regen_hp';
			conditon = () => !character.is_fully_healed() && !this.is_interrupted();
		} else if (mp_ratio < 1.00) {  // below 100% MP
			// Restore MP
			skill_id = 'regen_mp';
			conditon = () => !character.is_fully_charged() && !this.is_interrupted();
		}

		// Cast autocast
		if (skill_id && !character.skills[skill_id].is_autouse()) {
			character.skills[skill_id].autouse(null, null, conditon);
		}
	}

	/**
	 * Attempt to transfer items to a nearby merchant.
	 */
	_transfer_items() {
		const merchants = Entity.get_entities({'owner': true, ctype: 'merchant'});
		if (merchants.length === 0) {
			// No nearby merchants
			return;
		}

		for (let [i, item] of Item.indexed_items()) {
			// First two slots are reserved
			if (i < 2) {
				continue;
			}

			window.send_item(Util.random_choice(merchants), i, item.q);
		}

		if (character.gold > MAX_GOLD) {
			// Send 1% extra to avoid a flood of small change
			window.send_gold(Util.random_choice(merchants), character.gold - 0.99 * MAX_GOLD);
		}
	}

	/**
	 * Single step of brain logic.
	 */
	async _step() {
		if (!this.is_safe()) {
			this.on_state('Panic');
			await this._panic();
		} else if (this.is_party_healable()) {
			this.on_state('Heal');
			await this._heal_party();
		} else if (this.is_target_alive()) {
			this.on_state('Attack');
			await this._attack();
		} else if (this.is_low_hp()) {
			this.on_state('Rest');
			await this._rest();
		} else if (this.is_lost()) {
			this.on_state('Lost');
			await this._return_to_leader();
		} else {
			this.on_state('Find');
			await this._find_next_target();
		}
	}

	/** Emergency maneuvers. */
	async _panic() {
		// Stop whatever we were doing
		character.stop_all();

		if (character.skills.blink && character.skills.blink.is_usable()) {
			// Mages can blink away
			await character.skills.blink.use([0, 0]);

		} else {
			// We're probably under attack
			if (this.target && !this.target.dead) {
				// Start running away
				movement.pathfind_move({x: 0, y: 0});

				// Pop a potion
				await character.skills.use_hp.use_when_ready();
			}

			// Warp to map origin
			await character.skills.use_town.use_when_ready();
		}

		// Heal up
		await this._heal_up();
	}

	/** Heal someone in the party. */
	async _heal_party() {
		const party = Entity.get_party_members({alive: true});
		const target = party.length == 0 || Entity.hp_ratio(character) < Entity.hp_ratio(party[0]) ? character : party[0];
		if (!(Entity.hp_ratio(target) < 1.00)) {
			// No one to heal
			await this._idle();
			return;
		}

		if (!character.skills.heal.is_autouse()) {
			Logging.info(`Healing ${target.name}`)
			character.skills.heal.autouse(target, null, (t) => t.hp < t.max_hp);
		}

		window.set_message(`Heal (${target.name})`);
		await character.move_towards(target);
	}

	/** Return to our fearless leader! */
	async _return_to_leader() {
		Logging.info(`Returning to ${this.leader_name}`);
		const leader = maincode.character;
		if (!leader) {
			// Leader has gone missing!
			return null;
		}

		try {
			await character.xmove(leader.x, leader.y, leader.map);
		} catch (e) {
			Logging.warn(`Movement failed: ${e.reason}`);
			await this._sleep();
		}
	}

	/** Heal until we're fully recovered (or start losing HP). */
	async _heal_up() {
		// Let autocasts do their job
		await this.loop_until_interrupted(async () => {
			if (!(Entity.hp_ratio(character) < 1.00)) {
				return false;
			}

			await this._sleep();
		});
	}

	/** Return to home and recover some HP. */
	async _rest() {
		await this._return_home();
		await this._heal_up();
	}

	/** Attack current target */
	async _attack() {
		await this.loop_until_interrupted(async () => {
			if (!this.target || this.target.dead) {
				return false;
			}

			if (this.is_party_healable()) {
				return false;
			}

			if (!character.skills.attack.is_autouse()) {
				character.skills.attack.autouse(this.target, null, (t) => t === this.target && !t.rip);
			}

			try {
				await movement.kite(this.target);
			} catch (e) {
				Logging.warn('Movement failed', e);
				await this._sleep();
			}
		});
	}

	/** Find and move to our next target. */
	async _find_next_target() {
		// Return to home range
		if (!this.is_home()) {
			await this._return_home();
		}

		// See if we can find a target nearby
		this._pick_target();
		if (this.target) {
			return;
		}

		// Keep searching for a target
		await this.loop_until_interrupted(async () => {
			this._pick_target();
			if (this.target) {
				return false;
			}

			// Go find our leader
			if (this.is_lost()) {
				return false;
			}

			await this._sleep();
		});
	}

	/** Try to pick a new target. */
	_pick_target() {
		// Someone is trying to attack us! Attack them back!
		if (character.targets) {
			const targeted_by = Entity.get_nearby_monsters({target: character});
			const target = targeted_by[0];
			if (target) {
				this.set_target(target);
				return;
			}
		}

		// Help party
		const party = Entity.get_party_members({alive: true});
		for (let member of party) {
			const targeted_by = Entity.get_nearby_monsters({target: member});
			if (targeted_by.length < 1) {
				continue;
			}

			Logging.info(`Helping out ${member.name} against ${targeted_by[0].name}`)
			this.set_target(targeted_by[0]);
			return;
		}

		// Priests shouldn't pick new targets
		if (character.ctype == 'priest') {
			return;
		}

		// Are there any priority targets?
		for (let monster of Entity.get_nearby_monsters({path_check: true, filter: (t) => this.priority_targets.has(t.mtype)})) {
			Logging.info('Spotted priority target', monster.name);
			this.set_target(monster);
			return;
		}

		// Find a new monster
		for (let monster of Entity.get_nearby_monsters({path_check: true, no_target: true})) {
			const difficulty = Entity.difficulty(monster);
			if (difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) {
				continue;
			}

			this.set_target(monster);
			return;
		}
	}

	/** Return to our home location */
	async _return_home() {
		if (!this.home) {
			return;
		}

		Logging.info(`Returning to home in ${this.home.map}`);
		try {
			await character.xmove(this.home.x, this.home.y, this.home.map);
		} catch (e) {
			if (e.reason != 'interrupted') {
				throw e;
			}
		}
	}
}
