// Movement functions
// @ts-check
import * as Adventure from '/adventure.js';
import * as Draw from '/draw.js';
import * as Entity from '/entity.js';
import * as Logging from '/logging.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

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

const DEBUG_MOVEMENT = 0;  // 0: Off, 1: Movement, 2: Pathfinding
const DEBUG_COLLISION = 0;  // 0: Off, 1: On
const SMALL_STEP_RANGE = 64;  // Start with small steps for this much distance
const STEP = 16;  // Size of a tile
const RANGE = 32;  // When are we "close enough" to the target
const MAX_SEGMENT = 128;  // Maximum length of a simplified path segment
const OFFMAP_ESTIMATE = 10000;  // Estimate of distance outside this map
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
	 * @param {object|string} location Location to move to.
	 * @param {object} [pathfinding_options] Options for pathfinding behaviour.
	 * @param {object} [movement_options] Options for path movement behaviour.
	 * @returns {Promise} Resolves when location is reached.
	 */
	async pathfind_move(location, pathfinding_options, movement_options) {
		if (typeof location === 'string') {
			location = get_location_by_name(location);
		}

		DEBUG_MOVEMENT && Draw.clear_list('debug_pathfind');
		const path = await pathfind(location, pathfinding_options);
		DEBUG_MOVEMENT && Draw.add_list('debug_pathfind', draw_circle(location.x, location.y, 4, null, 0x0000ff));
		DEBUG_MOVEMENT && path.forEach(([x, y]) => Draw.add_list('debug_pathfind', draw_circle(x, y, 2, null, 0xff0000)));

		await this.follow_path(path, movement_options);
		DEBUG_MOVEMENT && Draw.clear_list('debug_pathfind');
	}

	/**
	 * Try to use our move, otherwise fall back to `smart_move`.
	 *
	 * @param {object} dest Destination to move to.
	 */
	async smarter_move(dest) {
		if (typeof dest === 'string') {
			dest = get_location_by_name(dest);
		}

		if (character.map === dest.map) {
			await this.pathfind_move(dest, null, {avoid: true});
		} else {
			await window.smart_move(dest);
		}
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

		// How far do we want to move?
		const entity_distance = Util.vector_distance(char_pos, entity_pos);
		const target_distance = Math.min(entity_distance + 50, 0.80 * character.range);

		// Relative angles
		const char_theta = Math.atan2(char_pos[1] - entity_pos[1], char_pos[0] - entity_pos[0]);
		const entity_theta = targeted && entity.moving ? Math.atan2(entity.vy, entity.vx) : char_theta;

		DEBUG_MOVEMENT && Draw.clear_list('debug_kite');
		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_circle(entity_pos[0], entity_pos[1], target_distance, null, 0x00ff00));

		// Circle clockwise
		let new_pos;
		for (let offset = 0; offset < 2 * Math.PI; offset += Math.PI / 64) {
			new_pos = [
				entity_pos[0] + target_distance * Math.cos(entity_theta + KITE_ANGLE + offset),
				entity_pos[1] + target_distance * Math.sin(entity_theta + KITE_ANGLE + offset)
			];

			if (Adventure.can_move_to(new_pos[0], new_pos[1])) {
				break;
			}
		}

		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_line(entity_pos[0], entity_pos[1], char_pos[0], char_pos[1], null, 0xff0000));
		DEBUG_MOVEMENT && Draw.add_list('debug_kite', window.draw_line(entity_pos[0], entity_pos[1], new_pos[0], new_pos[1], null, 0x0000ff));
		const max_distance = Math.max(entity_distance * character.speed / entity.speed, 48);
		await this.move(new_pos[0], new_pos[1], {max_distance: max_distance});
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
	 * Follow a path of positions.
	 *
	 * @param {Array<[number, number]>} path Path to follow.
	 * @param {object} [options] Path movement options.
	 * @param {number} [options.max_distance] Maximum distance to move.
	 * @param {boolean} [options.avoid] If true, try and avoid other entities.
	 * @returns {Promise} Resolves when this movement completes.
	 */
	follow_path(path, options) {
		options = options || {};
		this._create_task(async (task) => {
			Logging.debug(`Following path: ${path.map(position_to_string).join('; ')}`);
			let distance_traveled = 0;
			for (let p of path) {
				if (task.is_cancelled()) {
					Logging.debug('Follow path interrupted');
					return;
				}

				if (options.max_distance && distance_traveled > options.max_distance) {
					return;
				}

				// Calculate movement vector
				const current_pos = Movement.current_position();
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
				const new_position = Movement.current_position();
				distance_traveled += Util.distance(current_pos[0], current_pos[1], new_position[0], new_position[1]);
			}
		});

		return this.task.result();
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
	if (name in LOCATIONS) {
		return LOCATIONS[name];
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

/**
 * Find path to location.
 *
 * @param {object|string} location Location to move to.
 * @param {object} [options] Options for controlling pathfinding behaviour.
 * @param {number} [options.max_distance] Maximum distance to search (default: infinite).
 * @param {boolean} [options.exact=false] If true, must exactly reach target.
 * @param {boolean} [options.simplify=true] If true, attempt to simplify the path.
 * @returns {Promise<Array<[number, number]>>} Path found.
 * @throws {MovementError} If path could not be found.
 */
async function pathfind(location, options) {
	options = options || {};
	const simplify = 'simplify' in options ? options.simplify : true;
	const map = location.map || character.map;
	if (map !== character.map) {
		throw new MovementError('Moving between maps is not implemented!');
	}

	const origin = [character.real_x, character.real_y, character.map];
	const origin_key = position_to_string(origin);
	const target = [location.x, location.y, map];
	const target_key = position_to_string(target);

	// Unsearched edge
	const edge = [];
	edge.push([heuristic(origin, target), origin]);  // Start at origin

	// How did we reach this position?
	// We use a string key, since JavaScript doesn't hash arrays
	const came_from = {};
	came_from[origin_key] = null;

	// How far away is this position?
	const dist_so_far = {}
	dist_so_far[origin_key] = 0;

	// Find a path using A*
	let found = null;
	let t_snooze = Date.now();
	while (edge.length > 0) {
		const [_, current] = edge.shift();
		const key = position_to_string(current);
		const dist = dist_so_far[key];

		if (options.exact) {
			// Try to get to the exact position
			if (can_move(current, target)) {
				// Exact path found!
				came_from[target_key] = current;
				dist_so_far[target_key] = dist + Util.distance(current[0], current[1], target[0], target[1]);
				found = target;
				break;
			}
		} else {
			// Try to get "close enough"
			if (heuristic(current, target) < RANGE) {
				// Path found!
				found = current;
				break;
			}
		}

		DEBUG_MOVEMENT > 1 && Draw.add_list('debug_pathfind', draw_circle(current[0], current[1], 2, null, 0x00ff00));  // Searched

		const step = dist < SMALL_STEP_RANGE ? STEP / 2 : STEP;
		for (let next of neighbours(current, step)) {
			const next_key = position_to_string(next);
			let next_dist = dist + Util.distance(current[0], current[1], next[0], next[1]);
			if (options.max_distance && next_dist > options.max_distance) {
				// Too far!
				continue;
			}

			if (next_key in dist_so_far && next_dist >= dist_so_far[next_key]) {
				// We already have a better route
				continue;
			}

			edge.push([next_dist + heuristic(next, target), next]);
			came_from[next_key] = current;
			dist_so_far[next_key] = next_dist;
		}

		// Order by distance
		edge.sort(([c1, _p1], [c2, _p2]) => c1 - c2);

		// Don't completely hog the main thread
		// FIXME: This would be much better on a webworker
		const now = Date.now();
		if (Date.now() - t_snooze > 10) {
			await Util.sleep(0);
			t_snooze = now;
		}
	}

	if (!found) {
		throw new MovementError('No path found!');
	}

	// Backtrack from target to origin
	const path = [];
	do {
		path.unshift(found);
		found = came_from[position_to_string(found)];
	} while (found);

	DEBUG_MOVEMENT > 1 && path.forEach(([x, y]) => Draw.add_list('debug_move', draw_circle(x, y, 2, null, 0xffff00)));  // Path
	return simplify ? simplify_path(path) : path;
}

/**
 * Format position.
 *
 * @param {[number, number, number]} position (`x`, `y`, `map`).
 * @returns {string} Coordinates as `"x,y@map"`.
 */
function position_to_string(position) {
	return `${position[0].toFixed(0)},${position[1].toFixed(0)}@${position[2]}`;
}

/**
 * Heuristic estimating distance from here to there.
 *
 * @param {[number, number, number]} here Starting position (`x1`, `y1`, `map`).
 * @param {[number, number, number]} there Ending position (`x2`, `y2`, `map`).
 * @returns {number}
 */
function heuristic(here, there) {
	return Util.distance(here[0], here[1], there[0], there[1]) + (here[2] !== there[2] ? OFFMAP_ESTIMATE : 0);
}

/**
 * Find reachable neighbouring positions.
 *
 * @param {[number, number, number]} position (`x`, `y`, `map`) position.
 * @param {number} step Step size.
 * @returns {Array<[number, number, number]>} Neighbouring positions.
 */
function neighbours(position, step) {
	const pq_x = Util.quantize(position[0], step);
	const pq_y = Util.quantize(position[1], step);
	const points = [];
	for (let i=-step; i <= step; i += step) {
		for (let j=-step; j <= step; j += step) {
			if (i === 0 && j === 0) {
				continue;
			}

			const new_position = [pq_x + i, pq_y + j, position[2]];
			if (can_move(position, new_position)) {
				points.push(new_position);
			}
		}
	}

	return points;
}

/**
 * Can our character move from `here` to `there`?
 *
 * @param {[number, number, number]} here Starting position (`x1`, `y1`, `map`).
 * @param {[number, number, number]} there Ending position (`x2`, `y2`, `map`).
 * @returns {boolean} True if can move unobstructed, otherwise false.
 */
function can_move(here, there) {
	if (here[2] !== there[2]) {
		// Can't move between maps
		return false;
	}

	return window.can_move({
		map: character.map,
		x: here[0], y: here[1],
		going_x: there[0], going_y: there[1],
		base: character.base,
	});
}

/**
 * Simplify path by removing unnessisary segments.
 *
 * @param {Array<[number, number]>} path Path to simplify.
 * @return {Array<[number, number]>}
 */
function simplify_path(path) {
	const new_path = [];

	let i = 0;
	while (i < path.length) {
		new_path.push(path[i]);

		let j = i + 2;  // We know i + 1 is valid, so start at i + 2
		while (j < path.length && Util.distance(path[i][0], path[i][1], path[j][0], path[j][1]) < MAX_SEGMENT && can_move(path[i], path[j])) {
			j++;
		}
		i = j - 1;  // last valid position
	}

	return new_path;
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
