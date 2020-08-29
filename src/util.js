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
 * Normalize a vector to length 1.
 *
 * @param {number[]} v A vector.
 * @returns {number[]} Normalized vector
 */
export function vector_normalize(v) {
	const length = vector_length(v);
	return v.map((x) => x / length);
}

/**
 * Scale a vector by a constant.
 *
 * @param {number[]} v A vector.
 * @param {number} n Scaling constant.
 * @returns {number[]} Normalized vector
 */
export function vector_scale(v, n) {
	return v.map((x) => n * x);
}

/**
 * Calculate the length of a vector.
 *
 * @param {number[]} v A vector.
 * @returns {number} Vector length.
*/
export function vector_length(v) {
	// length = √(a² + b² + ...)
	return Math.sqrt(v.reduce((a, x) => a + Math.pow(x, 2), 0));
}
