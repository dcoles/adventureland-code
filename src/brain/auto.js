// Fully-automated brain
// @ts-check
import * as Adventure from '/adventure.js';
import * as Character from '/character.js';
import * as Logging from '/logging.js';
import * as Entity from '/entity.js';
import * as Util from '/util.js';

// The #maincode
const maincode = Adventure.get_maincode();

// Character wrapper
const character = Character.get_character();

const IDLE_MS = 250;
const STOP_MS = 1000;
const TICK_MS = 1000;
const TARGET_RANGE_RATIO = 0.90;
const HOME_RANGE_RADIUS = 500;
const MIN_DIFFICULTY = 0.1;
const MAX_DIFFICULTY = 9.0;
const KITING_THRESHOLD = 0.5;
const MOVEMENT_TOLLERANCE = 20;

class AutoBrain {
	constructor() {
		this.stopped = !character.bot && Adventure.get('stopped') || false;
		this.home = null;
		this.tick = 0;
		this.target = null;
		this.target_difficulty = 0;
		this.leader_name = null;
	}

	/** Are we interrupted? */
	is_interrupted() {
		return this.stopped || character.rip;
	}

	/** Are we safe? */
	is_safe() {
		const hp_ratio = character.hp / character.max_hp;

		// Must either have more than 10% HP or we're within 100px of the map origin
		return hp_ratio > 0.10 || character.distance(0, 0) < 100;
	}

	is_party_healable() {
		// Only priests can heal
		if (character.ctype !== 'priest') {
			return false;
		}

		// Does anyone need healing?
		for (let char of Entity.get_party_members()) {
			if (!char.rip && Entity.hp_ratio(char) < 1.00) {
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
		const hp_ratio = character.hp / character.max_hp;
		return hp_ratio < 0.30;  // Below 30%
	}

	/** Called on major state updates. */
	on_state(state) {
		Logging.debug('State', state);
		set_message(state);
	}

	/** Regular tick. */
	on_tick(tick) {
		Logging.debug('Tick', tick);
		if (character.rip) {
			// Nothing to do but go through his clothes and look for loose change.
			return;
		}

		character.loot();
		this._update_autocasts();
	}

	/**
	 * Stop the event loop.
	 */
	stop() {
		Logging.warn('Stopping event loop');
		Adventure.set('stopped', true);
		this.stopped = true;

		// Cease all motor functions
		character.stop_all();
	}

	/** Resume the event loop. */
	resume() {
		Logging.warn('Resuming event loop');
		Adventure.set('stopped', false);
		this.stopped = false;
	}

	/** Set current target. */
	set_target(target) {
		if (!target) {
			this.target = null;
			this.target_difficulty = 0;
			return;
		}

		this.target = target;
		this.target_difficulty = Entity.difficulty(this.target);
		Logging.info(`Target: ${target.name} (${this.target_difficulty.toFixed(1)})`);
		character.change_target(target);
	}

	/** Run the main loop. */
	async run() {
		this.on_state('Init')
		await this._init();
		do {
			if (this.stopped) {
				this.on_state('Stop');
				await this._stop();
			} else if (character.rip) {
				this.on_state('RIP');
				await this._rip();
			} else if (!this.is_safe()) {
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

			// Small pause for safety
			await Util.sleep(100);
		} while (true)
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
			window.draw_circle(this.home.x, this.home.y, this.home.range, null, 0xffff00);
		}

		// Focus on attacker when hit
		character.on('hit', (data) => {
			if (data.damage > 0) {
				const attacker = get_entity(data.actor);
				Logging.warn('Attacked by', attacker ? attacker.name : '???');
				character.stop('move');
				this.set_target(attacker);
			}
		});

		// Reoccuring timer
		setInterval(() => this._tick(), TICK_MS);

		// Initially we have no target
		change_target(null);
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
		if (this.stopped) {
			return;
		}

		this.on_tick(this.tick++);
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

	/** Wait until loop is restarted. */
	async _stop() {
		while (this.stopped) {
			await Util.sleep(STOP_MS);
		}
	}

	/** "He's dead Jim." */
	async _rip() {
		Logging.warn('Died at', new Date());
		character.stop_all();
		this.set_target(null);

		// Respawn after short delay (respawn has 12-sec cooldown)
		Logging.info('Respawning in 15s...')
		for (let n = 15; n > 0 && character.rip; n--) {
			set_message(`RIP (${n})`);
			await Util.sleep(1000);
		}
		Adventure.respawn();
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
				character.move_towards(this.target, -999);

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
		const party = Entity.get_party_members().filter((c) => !c.rip);
		const target = party[0];

		// No one to heal?
		if (!target) {
			return;
		}

		Logging.info(`Healing ${target.name}`)
		await character.move_towards(target);

		if (!character.skills.heal.is_autouse()) {
			character.skills.heal.autouse(target, null, (t) => t.hp < t.max_hp);
		}

		await Util.sleep(IDLE_MS);
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
			await Util.sleep(1000);
		}
	}

	/** Heal until we're fully recovered (or start losing HP). */
	async _heal_up() {
		let last_hp = character.hp;

		// Let autocasts do their job
		while (character.hp < character.max_hp && character.hp >= last_hp && !this.is_interrupted()) {
			last_hp = character.hp;
			await Util.sleep(IDLE_MS);
		}
	}

	/** Return to home and recover some HP. */
	async _rest() {
		await this._return_home();
		await this._heal_up();
	}

	/** Attack current target */
	async _attack() {
		const dist = character.distance_between(this.target);
		if (!dist) {
			return;
		}

		// Try to keep target at a good range
		const target_dist = character.is_ranged() ? TARGET_RANGE_RATIO * character.range : 0;
		const move = dist - target_dist;

		if (Math.abs(move) > MOVEMENT_TOLLERANCE) {
			if (this.is_kiting() || move > 0) {
				await character.move_towards(this.target, move, {avoid: character.is_ranged()});
				return;
			}
		}

		if (!character.skills.attack.is_autouse()) {
			character.skills.attack.autouse(this.target, null, (t) => !t.rip);
		}

		await Util.sleep(IDLE_MS);
	}

	/**
	 * Are we kiting enemies?
	 *
	 * @returns {boolean} True if kiting, otherwise False.
	 */
	is_kiting() {
		// Always kite difficult enemies or if our HP is below 50%
		const hp_ratio = character.hp / character.max_hp;
		return character.targets && (this.target_difficulty > KITING_THRESHOLD || hp_ratio < 0.50);
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
		do {
			this._pick_target();
			await Util.sleep(IDLE_MS);
		} while (!this.target && !this.is_interrupted())
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
		const party = Entity.get_party_members({alive: true, exclude_self: true});
		for (let member of party) {
			const targeted_by = Entity.get_nearby_monsters({target: member, exclude_self: true});
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

		// Find a new monster
		for (let monster of Entity.get_nearby_monsters({path_check: true, no_target: true})) {
			const difficulty = Entity.difficulty(monster);
			if (difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) {
				continue;
			}

			this.set_target(monster);
			break;
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

export function get_brain() {
	return new AutoBrain();
}
