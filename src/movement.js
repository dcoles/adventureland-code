// Movement functions
// @ts-check
import * as Logging from '/logging.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

const LOCATIONS = {
	'upgrade': {map: 'main', x: -204, y: -129},
	'compound': {map: 'main', x: -204, y: -129},
	'exchange': {map: 'main', x: -26, y: -432},
	'potions': {map: 'main', x: 56, y: -122},
	'scrolls': {map: 'main', x: -465, y: -71},
	'winter_potions': {map: 'winter_inn', x: -84, y: -173},
	'halloween_potions': {map: 'halloween', x: 149, y: -182},
}

const DEBUG_MOVEMENT = 0;  // 0: Off, 1: Movement, 2: Pathfinding
const SMALL_STEP_RANGE = 64;  // Start with small steps for this much distance
const STEP = 16;  // Size of a tile
const RANGE = 32;  // When are we "close enough" to the target
const MAX_SEGMENT = 128;  // Maximum length of a simplified path segment
const OFFMAP_ESTIMATE = 10000;  // Estimate of distance outside this map

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
	 * Stop movement.
	 */
	stop() {
		Logging.debug('Stopping movement');
		if (this.task) {
			this.task.cancel();
			this.task = null;
		}
		move(character.real_x, character.real_y);
	}

	/**
	 * Find a path to location, then follow it.
	 *
	 * @param {object|string} location Location to move to.
	 * @param {object} [options] Options for controlling pathfinding behaviour.
	 * @returns {Promise} Resolves when location is reached.
	 */
	async pathfind_move(location, options) {
		DEBUG_MOVEMENT && clear_drawings();
		if (typeof location === 'string') {
			location = get_location_by_name(location);
		}

		const path = await pathfind(location, options);
		DEBUG_MOVEMENT && draw_circle(location.x, location.y, 4, null, 0x0000ff);
		DEBUG_MOVEMENT && path.forEach(([x, y]) => draw_circle(x, y, 2, null, 0xff0000));

		await this.follow_path(path);
	}

	/**
	 * Follow a path of positions.
	 *
	 * @param {Array<[number, number]>} path Path to follow.
	 * @returns {Promise} Resolves when this movement completes.
	 */
	follow_path(path) {
		this._create_task(async (task) => {
			Logging.debug(`Following path: ${path.map(position_to_string).join('; ')}`);
			for (let p of path) {
				if (task.is_cancelled()) {
					Logging.debug('Follow path interrupted');
					break;
				}

				DEBUG_MOVEMENT && draw_line(character.real_x, character.real_y, p[0], p[1]);
				await window.move(p[0], p[1]);
			}
		});

		return this.task.result();
	}

	/**
	 * Create a movement task.
	 *
	 * @param {Async} task Async function that implements this task.
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
 * Find path to location.
 *
 * @param {object|string} location Location to move to.
 * @param {object} [options] Options for controlling pathfinding behaviour.
 * @param {number} [options.max_distance] Maximum distance to search (default: infinite).
 * @param {boolean} [options.exact=false] If true, must exactly reach target.
 * @param {boolean} [options.simplify=true] If true, attempt to simplify the path.
 * @returns {Array<[number, number]>} Path found.
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

		DEBUG_MOVEMENT > 1 && draw_circle(current[0], current[1], 2, null, 0x00ff00);  // Searched

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

	DEBUG_MOVEMENT > 1 && path.forEach(([x, y]) => draw_circle(x, y, 2, null, 0xffff00));  // Path
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
