// Movement functions
// @ts-check
import * as Adventure from '/adventure.js';
import * as Draw from '/draw.js';
import * as Entity from '/entity.js';
import * as Logging from '/logging.js';
import * as Pathfind from '/pathfind.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

export { PathfindError } from '/pathfind.js';

const LOCATIONS = {
	'town': {map: 'main', x: 0, y: 0},
	'bank': {map: 'main', x: 168, y: -134},
	'upgrade': {map: 'main', x: -204, y: -129},
	'compound': {map: 'main', x: -204, y: -129},
	'exchange': {map: 'main', x: -26, y: -432},
	'potions': {map: 'main', x: 56, y: -122},
	'scrolls': {map: 'main', x: -465, y: -71},
	'winter_potions': {map: 'winter_inn', x: -84, y: -173},
	'halloween_potions': {map: 'halloween', x: 149, y: -182},
}

const DEBUG_MOVEMENT = false;
const DEBUG_COLLISION = false;
const MIN_MOVE_DIST = 0.5 * character.speed;
const MAX_MOVE_DIST = character.speed;
const MAX_AVOIDANCE = 100;  // Maximum amount of avoidance to attempt
const KITE_ANGLE = Math.PI / 3;  // 60° clockwise

// Globals
let g_movement = null;

/** Error thrown when movement actions fail. */
export class MovementError extends Error {
	constructor(message) {
		super(message);
	}
}

/**
 * Movement options.
 *
 * @typedef MovementOptions
 * @property {number} [options.max_distance] Maximum distance to move.
 * @property {boolean} [options.avoid] If true, try and avoid other entities.
 */

class Movement {
	constructor() {
		this.task = null;
	}

	/**
	 * Get our current position.
	 *
	 * @returns {[number, number]} Position as (x, y) vector.
	 */
	static current_position() {
		return [window.character.real_x, window.character.real_y];
	}

	/**
	 * Get the map we're currently on.
	 *
	 * @returns {string} Map name.
	 */
	static current_map() {
		return window.character.map;
	}

	/**
	 * Stop movement.
	 */
	stop() {
		Logging.debug('Stopping movement');
		if (this.task) {
			this.task.cancel();
			this.task = null;
		}

		if (!character.rip) {
			window.move(window.character.real_x, window.character.real_y);
		}
	}

	/**
	 * Find a path to location, then follow it.
	 *
	 * @param {object} location Location to move to.
	 * @param {Pathfind.PathfindOptions} [pathfind_options] Options for pathfinding behaviour.
	 * @param {MovementOptions} [movement_options] Options for path movement behaviour.
	 * @returns {Promise} Resolves when location is reached.
	 */
	async pathfind_move(location, pathfind_options, movement_options) {
		DEBUG_MOVEMENT && Draw.clear_list('debug_pathfind');
		const path = await Pathfind.pathfind(location, pathfind_options);
		DEBUG_MOVEMENT && Draw.add_list('debug_pathfind', draw_circle(location.x, location.y, 4, null, 0x0000ff));
		DEBUG_MOVEMENT && path.forEach(([x, y]) => Draw.add_list('debug_pathfind', draw_circle(x, y, 2, null, 0xff0000)));

		await this.follow_path(path, movement_options);
		DEBUG_MOVEMENT && Draw.clear_list('debug_pathfind');
	}

	/**
	 * Try to use our move, otherwise fall back to `smart_move`.
	 *
	 * @param {object} dest Destination to move to.
	 * @param {Pathfind.PathfindOptions} [pathfind_options] Options for pathfinding behaviour.
	 * @param {MovementOptions} [movement_options] Options for path following behaviour.
	 */
	async smarter_move(dest, pathfind_options, movement_options) {
		if (typeof dest === 'string') {
			dest = get_location_by_name(dest);
		}

		// pathfind_move can't do maps yet!
		if (dest.map && character.map !== dest.map) {
			await window.smart_move(dest.map);
		}

		await this.pathfind_move(dest, pathfind_options, movement_options);
	}

	/**
	 * Attempt to kite the target.
	 *
	 * @param {Monster} entity Entity to kite.
	 */
	async kite(entity) {
		const targeted = entity.target === character.name;

		// Current positions
		const char_pos = [character.x, character.y];
		const entity_pos = [entity.x, entity.y];
		const entity_going = [entity.going_x, entity.going_y];

		// How far do we want to move?
		const entity_distance = Util.vector_distance(char_pos, entity_pos);
		const target_distance = Math.min(entity_distance + 50, 0.80 * character.range);

		if (!targeted) {
			if (entity_distance > target_distance) {
				// Need to get in range first
				await this.pathfind_move({x: entity_pos[0], y: entity_pos[1]}, null, {max_distance: entity_distance - target_distance});
			}

			if (entity.target) {
				// They're busy attacking someone else
				await Util.idle();
				return;
			}

			// Our attack will probably make us the target
		}

		// Relative angles
		const char_theta = Math.atan2(char_pos[1] - entity_pos[1], char_pos[0] - entity_pos[0]);
		const entity_theta = targeted && entity.moving ? Math.atan2(entity.vy, entity.vx) : char_theta;

		DEBUG_MOVEMENT && Draw.clear_list('debug_kite');
		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_circle(entity_pos[0], entity_pos[1], target_distance, null, 0x00ff00));

		// Circle clockwise
		let new_pos;
		for (let offset = 0; offset < 2 * Math.PI; offset += Math.PI / 64) {
			const theta = entity_theta + KITE_ANGLE + offset;
			new_pos = [
				entity_pos[0] + target_distance * Math.cos(theta),
				entity_pos[1] + target_distance * Math.sin(theta)
			];

			if (Adventure.can_move_to(new_pos[0], new_pos[1])) {
				break;
			}
		}

		// How long is the entity going to keep it's current course?
		const remaining_move_time = targeted && entity.moving ? Util.vector_distance(entity_pos, entity_going) / entity.speed
		: entity_distance / character.speed * (character.speed / entity.speed);
		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_line(entity_pos[0], entity_pos[1], entity_going[0], entity_going[1], null, 0xff0000));

		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_line(entity_pos[0], entity_pos[1], char_pos[0], char_pos[1], null, 0xff0000));
		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_line(entity_pos[0], entity_pos[1], new_pos[0], new_pos[1], null, 0x0000ff));
		const max_distance = Math.min(Math.max(character.speed * remaining_move_time, MIN_MOVE_DIST), MAX_MOVE_DIST);
		await this.move(new_pos[0], new_pos[1], {max_distance: max_distance});
	}

	/**
	 * Follow a path of positions.
	 *
	 * @param {Array<[number, number]>} path Path to follow.
	 * @param {MovementOptions} [options] Path movement options.
	 * @returns {Promise} Resolves when this movement completes.
	 */
	async follow_path(path, options) {
		options = options || {};
		this._create_task(async (task) => {
			Logging.debug(`Following path: ${path.map(([x, y]) => `${x},${y}`).join('; ')}`);
			let distance_traveled = 0;
			for (let p of path) {
				if (task.is_cancelled()) {
					Logging.debug('Follow path cancelled');
					return;
				}

				// FIXME: Workaround for movement not being interrupted on death
				if (character.rip) {
					return {reason: 'interrupted'};
				}

				if (options.max_distance && distance_traveled > options.max_distance) {
					return {reason: 'stopped'};
				}

				// Calculate movement vector
				const current_pos = [window.character.real_x, window.character.real_y];
				const segment_distance = Util.vector_distance(current_pos, p);

				// Must move at least 1 pixel length
				if (segment_distance < 1) {
					// Stop any current motion
					await window.move(current_pos[0], current_pos[1]);
					continue;
				}

				const dist = options.max_distance ? Math.min(segment_distance, options.max_distance - distance_traveled) : segment_distance;
				await this.move(p[0], p[1], {max_distance: dist, avoid: options.avoid});

				// Actual distance traveled
				const new_pos = [window.character.real_x, window.character.real_y];
				distance_traveled += Util.distance(current_pos[0], current_pos[1], new_pos[0], new_pos[1]);
			}
		});

		return this.task.result();
	}

	/**
	 * Move to position.
	 *
	 * @param {number} x x-coordinate.
	 * @param {number} y y-coordinate.
	 * @param {object} options Movement options.
	 */
	async move(x, y, options) {
		return this.move_to({x: x, y: y}, options)
	}

	/**
	 * Move towards a target.
	 *
	 * @param {object} target Target to move towards.
	 * @param {object} [options] Movement options.
	 * @param {number} [options.max_distance] Maximum distance to move.
	 * @param {boolean} [options.avoid] If true, try and avoid other entities.
	 */
	async move_to(target, options) {
		let dest = [target.x, target.y];
		const current_pos = Movement.current_position();
		const dist = Util.distance(current_pos[0], current_pos[1], dest[0], dest[1]);

		DEBUG_MOVEMENT && Draw.clear_list('debug_move');
		DEBUG_MOVEMENT && Draw.add_list('debug_move', draw_circle(dest[0], dest[1], 3, null, 0x0000ff));

		if (target.moving) {
			// First order approximation
			const t = Entity.movement_time(window.character, dist);
			dest = Util.vector_add(dest, movement_compensation(target, t));
		}

		if (options.max_distance && dist > options.max_distance) {
			// Respect `max_distance`
			const v = Util.vector_resize(Util.vector_difference(current_pos, dest), options.max_distance);
			dest = Util.vector_add(current_pos, v);
		}

		if (options.avoid) {
			// Avoid collision with other entities
			dest = collision_avoidance(dest);
		}

		DEBUG_MOVEMENT && Draw.add_list('debug_move', draw_line(current_pos[0], current_pos[1], dest[0], dest[1]));
		await window.move(dest[0], dest[1]);
	}

	/**
	 * Create a movement task.
	 *
	 * @param {Task.Async} async Async function that implements this task.
	 */
	_create_task(async) {
		this.stop();
		this.task = Task.create(async);
	}
}

/**
 * Get Movement singleton.
 *
 * @returns {Movement}
 */
export function get_movement() {
	if (!g_movement) {
		g_movement = new Movement();
	}
	return g_movement;
}

/**
 * Get location by name.
 *
 * @param {string} name Location name.
 */
export function get_location_by_name(name) {
	// Named location
	if (name in LOCATIONS) {
		return LOCATIONS[name];
	}

	// Map
	if (name in G.maps) {
		return {x: G.maps[name].spawns[0][0], y: G.maps[name].spawns[0][1], map: name};
	}

	// NPC
	const npc = window.find_npc(name);
	if (npc) {
		return npc;
	}

	throw new MovementError(`Could not find location: ${name}`);
}

/**
 * Estimate target's movement over time `t`.
 *
 * @param {Monster} target Target entity.
 * @param {number} t Time in seconds.
 */
function movement_compensation(target, t) {
	return [(target.vx || 0) * t, (target.vy || 0) * t];
}

/**
 * Adjust final position to avoid collissions.
 *
 * @param {[number, number]} dest Desired destination.
 */
function collision_avoidance(dest) {
	if (Adventure.can_move_to(dest[0], dest[1]) && !will_collide_moving_to(dest)) {
		return dest;
	}

	DEBUG_COLLISION && Draw.clear_list('debug_collision');

	// Try to find a spot we can move to
	const current_pos = Movement.current_position();
	const distance = Util.vector_distance(current_pos, dest);

	for (let r = 20; r < MAX_AVOIDANCE; r = Math.min(4 / 3 * r, MAX_AVOIDANCE)) {
		DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_circle(dest[0], dest[1], r));
		for (let m = 0; m < 8; m++) {
			// Pick a random angle
			const theta = Math.random() * 2 * Math.PI;
			const v = [r * Math.cos(theta), r * Math.sin(theta)];

			const new_dest = Util.vector_add(dest, v);
			DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_line(dest[0], dest[1], new_dest[0], new_dest[1], null, 0x0000ff));

			if (!Adventure.can_move_to(new_dest[0], new_dest[1])) {
				// Unreachable position.
				DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_circle(new_dest[0], new_dest[1], 2, null, 0xff0000));
				continue;
			}

			const dist = Util.vector_distance(current_pos, new_dest);
			if (dist < distance / 2) {
				// Must move a minimum of half the desired distance.
				// This is to avoid us going nowhere.
				continue;
			}

			if (dist !== MAX_AVOIDANCE && will_collide_moving_to(new_dest)) {
				// Avoid colliding with entities, except if we're searching really far.
				// Better to run past an enemy than to get stuck against a wall.
				DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_circle(new_dest[0], new_dest[1], 2, null, 0xffff00));
				continue;
			}

			DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_circle(new_dest[0], new_dest[1], 4, null, 0x00ff00));
			return new_dest;
		}
	}

	// Just try moving where originally intended
	return dest;
}

/**
 * Check if we ara likely collide with an entity while moving towards a destination.
 *
 * @param {[number, number]} dest Destination.
 * @returns {boolean} True if it appears we'd collide with an entity, otherwise False.
 */
function will_collide_moving_to(dest) {
	// Since we're not yet moving, work out our intended motion
	const current_pos = Movement.current_position();
	const d = Util.vector_difference(current_pos, dest);
	const v = Util.vector_resize(d, window.character.speed);
	const t_max = Util.vector_length(d) / window.character.speed;
	const char = {x: current_pos[0], y: current_pos[1], vx: v[0], vy: v[1]};

	// Check if this motion collides with any of the entities
	for (let entity of Object.values(Adventure.get_entities())) {
		if (Entity.will_collide(entity, char, t_max)) {
			DEBUG_COLLISION && Draw.add_list('debug_collision', window.draw_circle(entity.x, entity.y, entity.width / 2, null, 0xff0000));
			return true;
		}
	}

	return false;
}

/** Draw all boundary lines on this map. */
export function draw_lines() {
	for (let y_line of G.geometry[character.map].y_lines) {
		const x1 = y_line[1];
		const y1 = y_line[0];
		const x2 = y_line[2];
		const y2 = y_line[0];

		draw_line(x1, y1, x2, y2, null, 0xff0000);
	}

	for (let x_line of G.geometry[character.map].x_lines) {
		const x1 = x_line[0];
		const y1 = x_line[1];
		const x2 = x_line[0];
		const y2 = x_line[2];

		draw_line(x1, y1, x2, y2, null, 0xff0000);
	}
}
