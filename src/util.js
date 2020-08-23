// General utility functions
// @ts-check

/**
 * Sleep for a period of time.
 * 
 * @param {number} ms Timeout in milliseconds.
 * @returns {Promise} A promise that resolves after the timeout expires.
*/
export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sleep until specific date-time.
 * 
 * @param {Date} date Date-time to sleep until.
*/
export async function sleep_until(date) {
	const ts = date.getTime();

	let now = Date.now();
	while (now <= ts) {
		await sleep(ts - now);
		now = Date.now();
	}
}

/**
 * Calculate the distance between two points (`x1`, `y1`) and (`x2`, `y2`).
 *
 * This differs from the built-in `distance` function that does something
 * that is almost, but not quite, entirely unlike returning the distance
 * between two points (it lacks any documentation).
 *
 * @see https://adventure.land/docs/code/functions/distance
 *
 * @param {number} x1 x-coordinate of first point.
 * @param {number} y1 y-coordinate of first point.
 * @param {number} x2 x-coordinate of second point.
 * @param {number} y2 y-coordinate of second point.
 * @returns {number} Distance in pixels.
 */
export function distance(x1, y1, x2, y2) {
	return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}
