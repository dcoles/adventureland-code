// Character namespace
// @ts-check

import * as Adventure from './adventure.js';
import * as Entity from './entity.js';
import * as Util from './util.js';
import * as Skills from './skills.js';

const DEBUG_COLLISION = true;

// Globals
let g_character = null;

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
	get moving() { return character.moving; }
	get vx() { return character.vx; }
	get vy() { return character.vy; }
	get width() { return Adventure.get_width(character); }
	get height() { return Adventure.get_height(character); }

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
		const avoid = args.avoid || true;

		if (target instanceof String) {
			target = get_entity(target);
		}

		// Must be on the same map
		if (!target || target.map != character.map) {
			throw {'reason': 'not_found'};
		}

		// Default to 80% of range
		distance = distance || this.distance_between(target) - 0.80 * this.range;

		// Grab coordinates, lest they change
		const [x1, y1] = [character.x, character.y];
		const [x2, y2] = [target.x, target.y];
		const theta = Math.atan2(y2 - y1, x2 - x1);
		const target_x = x1 + distance * Math.cos(theta);
		const target_y = y1 + distance * Math.sin(theta);

		DEBUG_COLLISION && window.clear_drawings();
		if (window.can_move_to(target_x, target_y)
		&& (!avoid || !this.will_collide_moving_to(target_x, target_y))) {
			return await Adventure.move(target_x, target_y);
		}

		// Try to find a spot we can move to
		const max_distance = 2 * Math.abs(distance);
		for (let r = 20; r < max_distance; r = Math.min(4 / 3 * r, max_distance)) {
			DEBUG_COLLISION && window.draw_circle(target_x, target_y, r);
			for (let m = 0; m < 8; m++) {
				// Pick a random angle
				const theta2 = Math.random() * 2 * Math.PI;
				const new_x = target_x + r * Math.cos(theta2);
				const new_y = target_y + r * Math.sin(theta2);
				DEBUG_COLLISION && window.draw_line(target_x, target_y, new_x, new_y, null, 0x0000ff);

				if (!window.can_move_to(new_x, new_y)) {
					// Unreachable position.
					window.draw_circle(new_x, new_y, 2, null, 0xff0000);
					continue;
				}

				const dist = Util.distance(character.x, character.y, new_x, new_y);
				if (dist < distance / 2) {
					// Must move a minimum of half the desired distance.
					// This is to avoid us going nowhere.
					continue;
				}

				if (avoid && dist < max_distance / 2 && this.will_collide_moving_to(new_x, new_y)) {
					// Avoid colliding with entities, except if we're searching really far.
					// Better to run past an enemy than to get stuck against a wall.
					DEBUG_COLLISION && window.draw_circle(new_x, new_y, 2, null, 0xffff00);
					continue;
				}

				DEBUG_COLLISION && window.draw_circle(new_x, new_y, 4, null, 0x00ff00);
				return await Adventure.move(new_x, new_y);
			}
		}

		// Just try to move as much as possible
		return await Adventure.move(target_x, target_y);
	}

	/**
	 * Check if character will likely collide with an entity while moving
	 * towards a point.
	 *
	 * @param {number} x target x-coordinate.
	 * @param {number} y target y-coordinate.
	 * @returns {boolean} True if it appears we'd collide with an entity, otherwise False.
	 */
	will_collide_moving_to(x, y) {
		// Since we're not yet moving, work out our intended motion
		const d = [x - this.x, y - this.y];
		const v = Util.vector_scale(Util.vector_normalize(d), this.speed);
		const t_max = d[0] / v[0];
		const char = {x: this.x, y: this.y, vx: v[0], vy: v[1]};

		// Check if this motion collides with any of the entities
		for (let entity of Object.values(Adventure.get_entities())) {
			if (Entity.will_collide(entity, char, t_max)) {
				window.draw_circle(entity.x, entity.y, entity.width / 2, null, 0xff0000);
				return true;
			} else {
				window.draw_circle(entity.x, entity.y, entity.width / 2, null, 0x0000ff);
			}
		}

		return false;
	}

	/**
	 * Cancels channeling abilities or active skills.
	 *
	 * @param {string} [action='move'] Action to cancel.
	 */
	stop(action) {
		Adventure.stop(action);
	}

	/**
	 * Stop doing anything!
	 */
	stop_all() {
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
		if (character.map === map && Adventure.can_move_to(x, y)) {
			return await this.move_towards(location);
		} else {
			return await Adventure.smart_move(location);
		}
	}

	toString() {
		return `[Character ${this.name}]`;
	}
}
