// Pathfinding
// This implementation uses an A* search (often known as "best first search").
// See https://www.redblobgames.com/pathfinding/a-star/introduction.html for details.

// @ts-check
import * as Geometry from '/geometry.js';
import * as Util from '/util.js';
import * as Logging from '/logging.js';

const SMALL_STEP_RANGE = 64;  // Start with small steps for this much distance
const STEP = 16;  // Size of a tile
const DEFAULT_RANGE = 32;  // When are we "close enough" to the target
const DOOR_RANGE = 40;  // How close do we have to be to a door to use it?
const DOOR_CHAR_WIDTH = 26;
const DOOR_CHAR_HEIGHT = 35;
const MAX_SEGMENT = 128;  // Maximum length of a simplified path segment
const OFFMAP_ESTIMATE = 1_000;  // Estimate of distance outside this map

/**
 * Thrown when pathfinding fails.
 */
export class PathfindError extends Error {
	constructor (message) {
		super(message);
	}
}

/**
 * Pathfinding options.
 *
 * @typedef PathfindOptions
 * @property {number} [options.max_distance] Maximum distance to search (default: infinite).
 * @property {boolean} [options.exact=false] If true, must exactly reach target.
 * @property {number} [options.range=DEFAULT_RANGE] How close do we need to get to the target?
 * @property {boolean} [options.single_map=false] If true, don't search outside the current map.
 * @property {boolean} [options.simplify=true] If true, attempt to simplify the path.
 */

 /**
 * A single point along a path.
 *
 * Consists of a (`x`, `y`, `map`, `spawn`) tuple.
 * Spawn is optional and only provided for map changes.
 *
 * @typedef {Array<number, number, string, number?>} Waypoint
 */

/**
 * Dedicated WebWorker for pathfinding.
 */
export class PathfindWorker {
	constructor() {
		// Have to start workers from adventure.land origin
		const url = new URL('/pathfind_worker.js', import.meta.url);
		const blob = new Blob(
			[`import { main } from ${JSON.stringify(url)}; main();`],
			{type: 'application/javascript'});

		this._jobs = new Map();  // Map of Job IDs → `[resolve, reject]` callbacks
		this._worker = new Worker(window.URL.createObjectURL(blob), {type: 'module', name: 'pathfinder'});
		this._worker.onerror = (e) => Logging.error('Error in pathfind worker', e);
		this._worker.onmessage = (message) => this._on_message(message);

		// Initialize global context
		this._update_context({G: {geometry: G.geometry, maps: G.maps, npcs: G.npcs}});
	}

	/**
	 * Pathfind.
	 *
	 * @param {MapLocation} dest Destination.
	 * @param {PathfindOptions} options Pathfinding options.
	 * @returns {Promise<Waypoint[]>} Promise which resolves to array of waypoints.
	 */
	async pathfind(dest, options) {
		return new Promise((resolve, reject) => {
			const id = Util.random_id();
			this._jobs.set(id, [resolve, reject]);
			this._update_context({
				character: {
					x: character.x,
					y: character.y,
					map: character.map,
					base: character.base,
				}
			});
			this._worker.postMessage(['pathfind', id, [dest, options]]);
		});
	}

	/**
	 * Update worker global context.
	 *
	 * @param {object} context Context values to update.
	 */
	_update_context(context) {
		this._worker.postMessage(['update_context', null, context]);
	}

	/**
	 * Worker message.
	 *
	 * @param {MessageEvent} message
	 */
	_on_message(message) {
		const [type, id, data] = message.data;

		switch (type) {
			case 'resolve':
				this._resolve(id, data);
				break;
			case 'reject':
				this._reject(id, data);
				break;
			default:
				Logging.error('Unknown pathfind message', data);
		}
	}

	/**
	 * Resolve a job.
	 *
	 * @param {string} id Job ID.
	 * @param {*} data Associated data.
	 */
	_resolve(id, data) {
		this._jobs.get(id)[0](data);
		this._jobs.delete(id);
	}

	/**
	 * Reject a job.
	 *
	 * @param {string} id Job ID.
	 * @param {*} data Associated data.
	 */
	_reject(id, data) {
		this._jobs.get(id)[1](data);
		this._jobs.delete(id);
	}
}

/**
 * Find path to location.
 *
 * @param {MapLocation} dest Location to find path to.
 * @param {PathfindOptions} [options] Options for controlling pathfinding behaviour.
 * @returns {Waypoint[]} Path found.
 * @throws {PathfindError} If path could not be found.
 */
export function pathfind(dest, options) {
	options = options || {};
	const single_map = 'single_map' in options ? options.single_map : false;
	const simplify = 'simplify' in options ? options.simplify : true;
	const map = dest.map || character.map;

	if (single_map && map !== character.map) {
		throw new PathfindError('Destination outside current map!');
	}

	const origin = [character.x, character.y, character.map];
	const origin_key = position_to_string(origin);
	const target = [dest.x, dest.y, map];
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
	while (edge.length > 0) {
		const [_, current] = edge.shift();
		const key = position_to_string(current);
		const dist = dist_so_far[key];

		if (options.exact) {
			// Try to get to the exact position
			if (Geometry.can_move(current, target)) {
				// Exact path found!
				came_from[target_key] = current;
				dist_so_far[target_key] = dist + Util.distance(current[0], current[1], target[0], target[1]);
				found = target;
				break;
			}
		} else {
			// Try to get "close enough"
			if (heuristic(current, target) < (options.range || DEFAULT_RANGE)) {
				// Path found!
				found = current;
				break;
			}
		}

		const step = dist < SMALL_STEP_RANGE ? STEP / 2 : STEP;
		for (let next of neighbours(current, step, options.single_map)) {
			const next_key = position_to_string(next);
			let next_dist = dist + (next[2] === current[2] ? Util.distance(current[0], current[1], next[0], next[1]) : 0);
			if (options.max_distance && next_dist > options.max_distance) {
				// Too far!
				continue;
			}

			if (next_key in dist_so_far && next_dist >= dist_so_far[next_key]) {
				// We already have a better route
				continue;
			}

			const priority = next_dist + heuristic(next, target);
			const pos = Util.bsearch(edge, priority, (i, array) => array[i][0]);
			edge.splice(pos, null, [priority, next]);

			came_from[next_key] = current;
			dist_so_far[next_key] = next_dist;
		}
	}

	if (!found) {
		throw new PathfindError('No path found!');
	}

	// Backtrack from target to origin
	const path = [];
	do {
		path.unshift(found);
		found = came_from[position_to_string(found)];
	} while (found);

	return simplify ? simplify_path(path) : path;
}

/**
 * Format position.
 *
 * @param {[number, number, string]} position (`x`, `y`, `map`).
 * @returns {string} Coordinates as `"x,y@map"`.
 */
function position_to_string(position) {
	return `${position[0].toFixed(0)},${position[1].toFixed(0)}@${position[2]}`;
}

/**
 * Heuristic estimating distance from here to there.
 *
 * @param {[number, number, string]} here Starting position (`x1`, `y1`, `map`).
 * @param {[number, number, string]} there Ending position (`x2`, `y2`, `map`).
 * @returns {number}
 */
function heuristic(here, there) {
	return Util.distance(here[0], here[1], there[0], there[1]) + (here[2] !== there[2] ? OFFMAP_ESTIMATE : 0);
}

/**
 * Find reachable neighbouring positions.
 *
 * @param {[number, number, string]} position (`x`, `y`, `map`) position.
 * @param {number} step Step size.
 * @param {boolean} [single_map] If true, don't search outside the current map.
 * @returns {Array<Waypoint>} Neighbouring positions.
 */
function neighbours(position, step, single_map) {
	const pq_x = Util.quantize(position[0], step);
	const pq_y = Util.quantize(position[1], step);
	const map = position[2];
	const points = [];

	// Steps
	for (let i=-step; i <= step; i += step) {
		for (let j=-step; j <= step; j += step) {
			if (i === 0 && j === 0) {
				continue;
			}

			const new_position = [pq_x + i, pq_y + j, map];
			if (Geometry.can_move(position, new_position)) {
				points.push(new_position);
			}
		}
	}

	if (single_map) {
		// No need to search beyond the current map
		return points;
	}

	// Doors
	for (let door of G.maps[map].doors) {
		if (!is_door_close(map, door, position[0], position[1]) || !can_use_door(map, door, position[0], position[1])) {
			continue;
		}
		const new_map = door[4];
		const spawn = door[5] || 0;
		const new_x = G.maps[new_map].spawns[spawn][0];
		const new_y = G.maps[new_map].spawns[spawn][1];
		points.push([new_x, new_y, new_map, spawn]);
	}

	// Transporter
	const transporter = G.maps[map].npcs.find((npc) => npc.id === 'transporter');
	if (transporter && Util.distance(position[0], position[1], transporter.position[0], transporter.position[1]) < 75) {
		for (let [place, spawn] of Object.entries(G.npcs.transporter.places)) {
			const new_x = G.maps[place].spawns[spawn][0];
			const new_y = G.maps[place].spawns[spawn][1];
			points.push([new_x, new_y, place, spawn]);
		}
	}

	return points;
}

/**
 * Are we close to this door?
 *
 * @param {string} map Current map.
 * @param {Array} door Door tuple.
 * @param {number} x Current x-coordinate.
 * @param {number} y Current y-cooordinate.
 */
function is_door_close(map, door, x, y) {
	const p = G.maps[map].spawns[door[6]];

	// Are we close to the spawn point?
	if (Util.distance(x, y, p[0], p[1]) < DOOR_RANGE) {
		return true;
	}

	// Are we close to the door region?
	if (Geometry.box_distance(
		{x: x, y: y, width: DOOR_CHAR_WIDTH, height: DOOR_CHAR_HEIGHT},
		{x: door[0], y: door[1], width: door[2], height: door[3]}) < DOOR_RANGE) {
		return true;
	}

	return false;
}

/**
 * Can we use this door?
 *
 * @param {string} map Current map.
 * @param {Array} door Door tuple.
 * @param {number} x Current x-coordinate.
 * @param {number} y Current y-cooordinate.
 */
function can_use_door(map, door, x, y) {
	const p = G.maps[map].spawns[door[6]];

	// TODO: Check if we have the right key
	if (door[7]) {
		return false;
	}

	// Can we move directly to the spawn point?
	if (Util.distance(x, y, p[0], p[1]) < DOOR_RANGE
		&& Geometry.can_move([x, y, map], [p[0], p[1], map])) {
		return true;
	}

	// Can we move to the door region?
	if (Geometry.box_distance(
		{x: x, y: y, width: DOOR_CHAR_WIDTH, height: DOOR_CHAR_HEIGHT},
		{x: door[0], y: door[1], width: door[2], height: door[3]}) < DOOR_RANGE) {

		// TODO: Can we actually move there?
		return true;
	}

	return false;
}

/**
 * Simplify path by removing unnessisary segments.
 *
 * @param {Array<Waypoint>} path Path to simplify.
 * @return {Array<Waypoint>}
 */
function simplify_path(path) {
	const new_path = [];

	let i = 0;
	while (i < path.length) {
		new_path.push(path[i]);

		let j = i + 2;  // We know i + 1 is valid, so start at i + 2
		while (j < path.length
			&& Util.distance(path[i][0], path[i][1], path[j][0], path[j][1]) < MAX_SEGMENT
			&& Geometry.can_move(path[i], path[j])) {
			j++;
		}
		i = j - 1;  // last valid position
	}

	return new_path;
}
