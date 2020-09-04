// Movement functions
// @ts-check
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

const DEBUG_PATHFIND = 1;  // 0: Off, 1: Path, 2: All searched points
const DEBUG_MOVEMENT = 1;  // 0: Off, 1: Movement
const SMALL_STEP_RANGE = 64;  // Start with small steps for this much distance
const STEP = 16;  // Size of a tile
const RANGE = 32;  // When are we "close enough" to the target
const MAX_SEGMENT = 128;  // Maximum length of a simplified path segment

/** Error thrown when movement actions fail. */
class MovementError extends Error {
	constructor(message) {
		super(message);
	}
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
 * Find a path to location, then follow it.
 *
 * @param {object|string} location Location to move to.
 * @returns {Promise} Resolves when location is reached.
 */
export async function pathfind_move(location) {
	if (typeof location === 'string') {
		location = get_location_by_name(location);
	}

	await follow_path(simplify_path(pathfind(location)));
}

/**
 * Find path to location.
 *
 * @param {object|string} location Location to move to.
 * @returns {Array<[number, number]>} Path found.
 * @throws {MovementError} If path could not be found.
 */
function pathfind(location) {
	const map = location.map || character.map;
	if (map !== character.map) {
		throw new MovementError('Moving between maps is not implemented!');
	}

	const origin = [character.real_x, character.real_y];
	const origin_key = position_to_string(origin);
	const target = [location.x, location.y];
	DEBUG_PATHFIND && clear_drawings();
	DEBUG_PATHFIND && draw_circle(target[0], target[1], 3, null, 0x0000ff);  // Target

	// Unsearched edge
	const edge = [];
	edge.push([0, origin]);  // Start at origin

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
		const [dist, current] = edge.shift();

		if (Util.distance(current[0], current[1], target[0], target[1]) < RANGE) {
			// Path found!
			found = current;
			break;
		}

		DEBUG_PATHFIND > 1 && draw_circle(current[0], current[1], 2, null, 0x00ff00);  // Searched

		const step = dist < SMALL_STEP_RANGE ? STEP / 2 : STEP;
		for (let next of neighbours(current, step)) {
			const next_key = position_to_string(next);
			let next_dist = dist + Util.distance(current[0], current[1], next[0], next[1]);
			if (!(next_key in dist_so_far) || next_dist < dist_so_far[next_key]) {
				const heuristic = Util.distance(next[0], next[1], target[0], target[1]);
				edge.push([next_dist + heuristic, next]);
				came_from[next_key] = current;
				dist_so_far[next_key] = next_dist;
			}
		}

		// Order by cost
		edge.sort(([c1, _p1], [c2, _p2]) => c1 - c2);
	}

	if (!found) {
		throw new MovementError('No path found!');
	}

	// Backtrack from target to origin
	const path = [];
	do {
		path.unshift(found);
		DEBUG_PATHFIND && draw_circle(found[0], found[1], 2, null, 0xff0000);  // Path
		found = came_from[position_to_string(found)];
	} while (found);

	return path;
}

/**
 * Format position.
 *
 * @param {[number, number]} position 2D position (`x`, `y`).
 * @returns {string} Coordinates as `"x,y"`.
 */
function position_to_string(position) {
	return `${position[0].toFixed(0)},${position[1].toFixed(0)}`;
}

/**
 * Find reachable neighbouring positions.
 *
 * @param {[number, number]} position (`x`, `y`) position.
 * @param {number} step Step size.
 * @returns {Array<[number, number]>} Neighbouring positions.
 */
function neighbours(position, step) {
	const points = [];
	for (let i=-1; i < 2; i++) {
		for (let j=-1; j < 2; j++) {
			if (i === 0 && j === 0) {
				continue;
			}

			const new_position = quantize_position(
				[position[0] + step * i, position[1] + step * j], STEP);
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
 * @param {[number, number]} here Starting position (`x1`, `y1`).
 * @param {[number, number]} there Ending position (`x2`, `y2`).
 * @returns {boolean} True if can move unobstructed, otherwise false.
 */
function can_move(here, there) {
	return window.can_move({
		map: character.map,
		x: here[0], y: here[1],
		going_x: there[0], going_y: there[1],
		base: character.base,
	});
}

/**
 * Quantize a postion to a multiple of `q`.
 *
 * @param {[number, number]} position (`x1`, `y1`).
 * @param {number} q Quantizing factor.
 * @returns {[number, number]} Quantized postion.
 */
function quantize_position(position, q) {
	return [
		Math.floor(position[0] / q) * q + q / 2,
		Math.floor(position[1] / q) * q + q / 2
	]
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

/**
 * Follow a path of positions.
 *
 * @param {Array<[number, number]>} path Path to follow.
 * @returns {Promise} Resolves when destination is reached.
 */
export async function follow_path(path) {
	for (let p of path) {
		DEBUG_MOVEMENT && draw_line(character.real_x, character.real_y, p[0], p[1]);
		await window.move(p[0], p[1]);
	}
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
