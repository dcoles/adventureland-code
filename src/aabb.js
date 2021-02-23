// Axis-Aligned Bounding Boxes
// @ts-check
import * as Util from '/util.js';

/**
 * An Axis-Aligned Bounding Box (min-max).
 * @typedef {[[number, number], [number, number]]} AABB
 */

/**
 * 2D Vector.
 * @typedef {[number, number]} Vector2D
 */

/**
 * Do two AABBs intersect?
 *
 * See "Real Time Collision Detection" [Ericson2005] section 4.1.2.
 *
 * @param {AABB} a First entity
 * @param {AABB} b Second entity.
 * @returns {boolean}
 */
export function intersect(a, b) {
	// Get bounding boxes
	const [a_min, a_max] = a;
	const [b_min, b_max] = b;

	// Check if seperated along an axis
	for (let i = 0; i < 2; i++) {
		if (a_max[i] < b_min[i] || a_min[i] > b_max[i]) {
			return false;
		}
	}

	// Overlapping on all axis means AABBs are intersecting
	return true;
}

/**
 * Do two moving AABBs intersect?
 *
 * See "Real Time Collision Detection" [Ericson2005] section 5.5.8.
 *
 * @param {AABB} a First entity
 * @param {AABB} b Second entity.
 * @param {Vector2D} va First entity velocity.
 * @param {Vector2D} vb Second entity velocity.
 * @param {number} t_max Maximum time to consider (default 1.0).
 * @returns {[number, number]|null} Time of first/last intersection or `null` if they don't intersect.
 */
export function intersect_moving(a, b, va, vb, t_max) {
	t_max = t_max ?? 1.0;

	// Exit early if A and B are initially overlapping
	if (intersect(a, b)) {
		return [0.0, 0.0];
	}

	// Get bounding boxes
	const [a_min, a_max] = a;
	const [b_min, b_max] = b;

	// Use relative velocity, effectively treating A as stationary
	const v = Util.vector_difference(vb, va);

	// Initialize time of first and last contact
	let tfirst = 0.0;
	let tlast = t_max;

	for (let i = 0; i < 2; i++) {
		if (v[i] < 0) {
			if (b_max[i] < a_min[i]) return null;  // Non-intersecting and moving appart
			if (a_max[i] <= b_min[i]) tfirst = Math.max((a_max[i] - b_min[i]) / v[i], tfirst);
			if (b_max[i] >= a_min[i]) tlast = Math.min((a_min[i] - b_max[i]) / v[i], tlast);
		} else if (v[i] > 0) {
			if (b_min[i] > a_max[i]) return null;  // Non-intersecting and moving appart
			if (b_max[i] <= a_min[i]) tfirst = Math.max((a_min[i] - b_max[i]) / v[i], tfirst);
			if (a_max[i] >= b_min[i]) tlast = Math.min((a_max[i] - b_min[i]) / v[i], tlast);
		} else {
			// Handle case where velocity is zero
			// https://gamedev.stackexchange.com/a/144871/147826
			if (b_max[i] < a_min[i] || b_min[i] > a_max[i]) return null;  // Non-intersecting
		}

		// No overlap possible if time of first contact occurs after time of last contact
		if (tfirst > tlast) {
			return null;
		}
	}

	return [tfirst, tlast];
}
