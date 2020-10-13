// Fully-automated brain
// @ts-check
import * as Adventure from '/adventure.js';
import * as Character from '/character.js';
import * as Color from '/color.js';
import * as Entity from '/entity.js';
import * as Game from '/game.js';
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

const HOME_RANGE_RADIUS = 500;
const MIN_DIFFICULTY = 0.1;
const MAX_DIFFICULTY = 9.0;
const MAX_GOLD = 500_000;  // Max gold before transfering
const PRIORITY_TARGETS = ['mrpumpkin', 'mrgreen', 'phoenix', 'snowman', 'hen', 'rooster'];

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
		return Entity.hp_ratio(character) > 0.15 || character.distance(0, 0) < 100;
	}

	/** Is our target alive? */
	is_target_alive() {
		return this.target && !Entity.is_dead(this.target);
	}

	/** Is our HP getting low? */
	is_low_hp() {
		return Entity.hp_ratio(character) < 0.50;  // Below 30%
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
			window.draw_circle(this.home.x, this.home.y, this.home.range, null, Color.YELLOW);
		}

		// Focus on attacker when hit
		character.on('hit', (data) => {
			if (data.damage > 0) {
				const attacker = get_entity(data.actor);
				if (this.target !== attacker) {
					Logging.warn('Attacked by', attacker ? attacker.name : '???');
					this.set_target(attacker);
				}
			}
		});

		this.create_task('respawn', async task => {
			while (!task.is_cancelled()) {
				if (this.stopped) {
					await Util.sleep(Util.SECOND_MS);
					continue;
				}

				await Game.next_event('player', char => char.rip);
				Logging.warn('Character died at', new Date());
				await this._respawn();
			}
		});

		this.create_task('panic', async task => {
			while (!task.is_cancelled()) {
				await Game.next_event('player', _ => !this.is_safe());
				this.interrupt = true;
				try {
					await this._panic();
				} finally {
					this.interrupt = false;
				}
			}
		});

		this.create_task('pick_target', async task => {
			const regulator = new Util.Regulator(Util.IDLE_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();
				await this.sleep_while_interrupted();

				const needs_healing = this._needs_healing();
				if (character.skills.heal && needs_healing) {
					this.set_target(needs_healing);
				} else {
					this._pick_hostile_target();
				}
			}
		});

		this.create_task('heal_and_harm', async task => {
			const regulator = new Util.Regulator(Util.IDLE_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();
				await this.sleep_while_interrupted();

				if (!this.is_target_alive()) {
					continue;
				}

				const skill = this.target.type === 'character' ? character.skills.heal : character.skills.attack;
				if (!skill) {
					continue;
				}

				if (skill.is_on_cooldown()) {
					await skill.wait_until_ready();
					continue;
				}

				if (character.mp < skill.mp) {
					const current_mp = character.mp;
					await Game.next_event('player', char => char.mp != current_mp);
					continue;
				}

				if (!skill.is_in_range(this.target)) {
					continue;
				}

				try {
					await skill.use(this.target);
				} catch (e) {
					Logging.warn(`${skill.name} failed`, e);
				}
			}
		});

		this.create_task('movement', async task => {
			const regulator = new Util.Regulator(Util.IDLE_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();
				await this.sleep_while_interrupted();

				if (this.target && this.target.type === 'monster' && !this.target.dead) {
					set_message('Attack');
					await movement.kite(this.target);
				} else if (character.bot) {
					set_message('Lost');
					await this._return_to_leader();
				} else if (this.home) {
					set_message('Home');
					await this._return_home();
				}
			}
		});

	 	// Attempt to transfer items to a nearby merchant.
		this.create_task('transfer_items', async task => {
			const regulator = new Util.Regulator(Util.SECOND_MS);
			while (!task.is_cancelled()) {
				await regulator.regulate();
				await this.sleep_while_interrupted();

				const merchants = Entity.get_entities({'owner': true, ctype: 'merchant'});
				if (merchants.length === 0) {
					// No nearby merchants
					continue;
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
		});

		// Initially we have no target
		change_target(null);
	}

	/**
	 * Single step of brain logic.
	 */
	async _step() {
		character.loot();
		this._join_party();
		this._update_autocasts();

		await Util.sleep(Util.SECOND_MS);
	}

	/** Try to join the party. */
	_join_party() {
		// Check if we're already in a party
		if (character.party) {
			return;
		}

		Adventure.send_party_request(this.leader_name);
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

	/** Emergency maneuvers. */
	async _panic() {
		set_message('Panic');

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
	}

	/**
	 * Is there a nearby character who needs healing?
	 *
	 * @returns Player object or null.
	 */
	_needs_healing() {
		const party = Entity.get_party_members({alive: true});
		const target = party.length == 0 || Entity.hp_ratio(character) < Entity.hp_ratio(party[0]) ? character : party[0];
		if (!(Entity.hp_ratio(target) < 0.90)) {
			// No one to heal
			return null;
		}

		return target;
	}

	/** Try to pick a new target. */
	_pick_hostile_target() {
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

			this.set_target(targeted_by[0]);
			return;
		}

		// Don't pick a fight if we're a priest or our HP is low
		if (character.ctype == 'priest' || this.is_low_hp()) {
			return;
		}

		// Are there any priority targets?
		for (let monster of Entity.get_nearby_monsters({path_check: true, filter: (t) => this.priority_targets.has(t.mtype)})) {
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

	/** Return to our fearless leader! */
	async _return_to_leader() {
		const leader = maincode.character;
		if (!leader) {
			// Leader has gone missing!
			return;
		}

		if (character.map === leader.map && character.distance_between(leader) < HOME_RANGE_RADIUS) {
			return;
		}

		Logging.info(`Returning to ${this.leader_name}`);
		try {
			await character.xmove(leader.x, leader.y, leader.map);
		} catch (e) {
			Logging.warn('Movement failed', e);
		}
	}

	/** Return to our home location */
	async _return_home() {
		if (!this.home) {
			return;
		}

		if (character.map === this.home.map && character.distance_between(this.home) < HOME_RANGE_RADIUS) {
			return;
		}

		Logging.info(`Returning to home in ${this.home.map}`);
		await character.xmove(this.home.x, this.home.y, this.home.map);
	}
}
