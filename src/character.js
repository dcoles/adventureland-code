// Character namespace
// @ts-check

import * as Adventure from '/adventure.js';
import * as Entity from '/entity.js';
import * as Movement from '/movement.js';
import * as Util from '/util.js';
import * as Skills from '/skills.js';

// Globals
let g_character = null;

// Movement controller
const movement = Movement.get_movement();

/**
 * Get the singleton `Character` object.
 *
 * @returns {Character}
 */
export function get_character() {
	if (!g_character) {
		g_character = new Character();
	}
	return g_character;
}

/**
 * Your Character.
 */
class Character {
	constructor() {
		/** Character skills. */
		this.skills = {}

		// Register all valid skills
		for (let [skill_id, skill] of Object.entries(G.skills)) {
			if ((skill.type == "skill" || skill.type == "ability")
			&& (!skill.class || skill.class.includes(character.ctype))) {
				this.skills[skill_id] = Skills.get_skill(skill_id);
			}
		}
	}

	// Re-exports of standard attributes
	get name() { return character.name; }
	get owner() { return character.owner; }
	get bot() { return character.bot; }
	get ctype() { return character.ctype; }
	get party() { return character.party; }
	get hp() { return character.hp; }
	get max_hp() { return character.max_hp; }
	get mp() { return character.mp; }
	get max_mp() { return character.max_mp; }
	get gold() { return character.gold; }
	get xp() { return character.xp; }
	get max_xp() { return character.max_xp; }
	get level() { return character.level; }
	get rip() { return character.rip; }
	get str() { return character.str; }
	get int() { return character.int; }
	get dex() { return character.dex; }
	get vit() { return character.vit; }
	get for() { return character.for; }
	get attack() { return character.attack; }
	get frequency() { return character.frequency; }
	get speed() { return character.speed; }
	get range() { return character.range; }
	get targets() { return character.targets; }
	get target() { return character.target; }
	get in() { return character.in; }
	get map() { return character.map; }
	get x() { return character.x; }
	get y() { return character.y; }
	get real_x() { return character.real_x; }
	get real_y() { return character.real_y; }
	get moving() { return character.moving; }
	get vx() { return character.vx; }
	get vy() { return character.vy; }
	get width() { return Adventure.get_width(character); }
	get height() { return Adventure.get_height(character); }
	get items() { return character.items; }
	get bank() { return character.bank; }

	/**
	 * Register callback for Character events.
	 *
	 * @see https://adventure.land/docs/code/character/events
	 *
	 * @param {string} action Action to monitor.
	 * @param {Function} callback Callback function.
	 */
	on(action, callback) {
		return character.on(action, callback)
	}

	/**
	 * Change character's active target.
	 *
	 * @param {object|string} target New target.
	 */
	change_target(target) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		Adventure.change_target(target);
	}

	/**
	 * Get the current targeted monster.
	 *
	 * Returns `null` if not a monster or the target is dead.
	 *
	 * @returns {Monster}
	 */
	get_targeted_monster() {
		return window.get_targeted_monster();
	}

	/**
	 * Loot chests.
	 *
	 * If a string ID is provided, then loot a specific chest.
	 * If `true` is provided, have this character's commander loot instead.
	 *
	 * @param {string|boolean} [id_or_arg] What to loot.
	 */
	loot(id_or_arg) {
		window.loot(id_or_arg);
	}

	/**
	 * Warp to center of the map.
	 */
	async town() {
		await this.skills.use_town.use_when_ready();
		do {
			await Util.sleep(character.c.town && character.c.town.ms || Util.IDLE_MS);
		} while (character.c.town)
	}

	/** Are we fully healed? */
	is_fully_healed() {
		return character.hp == character.max_hp;
	}

	/** Are we fully charged? */
	is_fully_charged() {
		return character.mp == character.max_mp;
	}

	/**
	 * Is the character in range of target.
	 *
	 * @param {object|string} target Character or Monster.
	 * @param {string} [skill_id="attack"] Specific skill to check.
	 */
	is_in_range(target, skill_id) {
		if (target instanceof String) {
			target = get_entity(target);
		}

		return window.is_in_range(target, skill_id);
	}

	/** Is this a ranged character? */
	is_ranged() {
		// Not sure if this is exactly true, but probably close enough
		return this.range > this.width;
	}

	/**
	 * Distance between the character and target.
	 *
	 * @param {object|string} entity Entity to measure distance to.
	 * @returns {number|null} Distance in pixels or or `null` if entity is not on the same map.
	 */
	distance_between(entity) {
		if (entity instanceof String) {
			entity = get_entity(entity);
		}

		if (!entity) {
			return null;
		}

		return Entity.distance_between(this, entity);
	}

	/**
	 * Distance position is away from character.
	 *
	 * @param {number} x x-coordinate.
	 * @param {number} y y-coordinate.
	 * @returns {number} Distance in pixels.
	 */
	distance(x, y) {
		return Util.distance(character.x, character.y, x, y);
	}

	/**
	 * Move towards a target.
	 *
	 * @param {object|string} target Target to move towards.
	 * @param {number} [distance] Distance to move in pixels (default: 80% of range).
	 * @param {object} [args] Additional arguments.
	 * @param {boolean} [args.avoid=true] Avoid entities when moving.
	 * @returns {Promise} Resolves when finished moving.
	 **/
	async move_towards(target, distance, args) {
		args = args || {};

		if (target instanceof String) {
			target = get_entity(target);
		}

		// Must be on the same map
		if (!target || target.map != character.map) {
			throw {'reason': 'not_found'};
		}

		// Default to 80% of range
		distance = distance || this.distance_between(target) - 0.80 * this.range;
		if (distance < 0) {
			return;
		}

		await movement.move_to(target, {max_distance: distance, avoid: args.avoid});
	}

	/**
	 * Cancels channeling abilities or active skills.
	 *
	 * @param {string} [action='move'] Action to cancel.
	 */
	stop(action) {
		movement.stop();
		Adventure.stop(action);
	}

	/**
	 * Stop doing anything!
	 */
	stop_all() {
		movement.stop();
		Adventure.stop('move');
		Adventure.stop('town');
		Adventure.stop('revival');

		// Cancel all autouse/autocasts
		for (let [_, skill] of Object.entries(this.skills)) {
			skill.cancel_autouse();
		}
	}

	/**
	 * Try to move directly to position, otherwise use pathfinding.
	 *
	 * @param {number} x x-coordinate.
	 * @param {number} y y-coordinate.
	 * @param {string} [map] Map (default: current map).
	 * @returns {Promise} Resolves when movement is complete.
	 */
	async xmove(x, y, map) {
		map = map || character.map;
		const location = {x: x, y: y, map: map};
		return await movement.pathfind_move(location, null, {avoid: true});
	}

	toString() {
		return `[Character ${this.name}]`;
	}
}
