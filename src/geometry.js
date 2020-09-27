// Functions for working with Geometry
// @ts-check
import * as Util from '/util.js';

/**
 * Can our character move from `here` to `there`?
 *
 * @param {[number, number, string]} here Starting position (`x1`, `y1`, `map`).
 * @param {[number, number, string]} there Ending position (`x2`, `y2`, `map`).
 * @returns {boolean} True if can move unobstructed, otherwise false.
 */
export function can_move(here, there) {
	if (here[2] !== there[2]) {
		// Can't move between maps
		return false;
	}

	const map = here[2];
	const geometry = G.geometry[map];

	// Bounding box
	const here_min = [here[0] - character.base.h, here[1] - character.base.v];
	const here_max = [here[0] + character.base.h, here[1] + character.base.vn];
	const there_min = [there[0] - character.base.h, there[1] - character.base.v];
	const there_max = [there[0] + character.base.h, there[1] + character.base.vn];

	const min = [Math.min(here_min[0], there_min[0]), Math.min(here_min[1], there_min[1])];
	const max = [Math.max(here_max[0], there_max[0]), Math.max(here_max[1], there_max[1])];

	// Displacement of character
	const v = Util.vector_difference(there.slice(0, 2), here.slice(0, 2));

	// Horizontal lines
	for (let y_line of geometry.y_lines) {
		const y = y_line[0];
		const x1 = y_line[1];
		const x2 = y_line[2];

		if (y < min[1]) {
			continue;
		} else if (y > max[1]) {
			break;
		}

		// Do the bounding boxes collide?
		if (collide([x1, y], [x2, y], here_min, here_max, v)) {
			return false;
		}
	}

	// Vertical lines
	for (let x_line of geometry.x_lines) {
		const x = x_line[0];
		const y1 = x_line[1];
		const y2 = x_line[2];

		if (x < min[0]) {
			continue;
		} else if (x > max[0]) {
			continue;
		}

		// Do the bounding boxes collide?
		if (collide([x, y1], [x, y2], here_min, here_max, v)) {
			return false;
		}
	}

	return true;
}

/**
 * Do two bounding-boxes collide?
 *
 * @see https://www.gamasutra.com/view/feature/131790/simple_intersection_tests_for_games.php?page=3
 *
 * @param {[number, number]} a_min Bounds of first line (min).
 * @param {[number, number]} a_max Bounds of first line (max).
 * @param {[number, number]} b_min Bounds of second line (min).
 * @param {[number, number]} b_max Bounds of second line (max).
 * @param {[number, number]} v Relative displacement of `b` from `a`'s reference.
 * @returns True if lines collide, else false.
 */
export function collide(a_min, a_max, b_min, b_max, v) {
	// Iterate over axis and find time first/last overlap
	let u0 = [-Infinity, -Infinity];
	let u1 = [-Infinity, -Infinity];
	for (let i = 0; i < 2; i++) {
		if (a_max[i] < b_min[i] && v[i] < 0) {
			// A left/above of B and converging
			u0[i] = (a_max[i] - b_min[i]) / v[i];
		} else if (a_min[i] > b_max[i] && v[i] >= 0) {
			// A right/below of B and converging
			u0[i] = (a_min[i] - b_max[i]) / v[i];
		}

		if (a_min[i] < b_max[i] && v[i] < 0) {
			// A left/above of B and converging
			u1[i] = (a_min[i] - b_max[i]) / v[i];
		} else if (a_max[i] > b_min[i] && v[i] >= 0) {
			// A right/below of B and converging
			u1[i] = (a_max[i] - b_min[i]) / v[i];
		}
	}

	// Can only overlap if first overlap time is before the last overlap time
	const u0_max = Math.max(...u0);
	const u1_min = Math.min(...u1);
	return u0_max <= u1_min && u0_max <= 1 && u1_min >= 0;
}
