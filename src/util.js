// General utility functions
// @ts-check

export const IDLE_MS = 250;  // Magic idle time
export const SECOND_MS = 1_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3600_000;

/**
 * Regulate tight loops.
 *
 * Ensures that a minimum amount of time is spent on each iteration.
 */
export class Regulator {
	/**
	 * @param {number} [min_duration=IDLE_MS] Minimum duration in milliseconds.
	 */
	constructor(min_duration) {
		this.min_duration = min_duration || IDLE_MS;
		this.last_t = Date.now();
	}

	/**
	 * Regulate loop iteration if required.
	 */
	async regulate() {
		const t_delta = Date.now() - this.last_t;
		if (t_delta < this.min_duration) {
			await sleep(this.min_duration - t_delta);
		}
		this.last_t = Date.now();
	}
}

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
 * Idle for a short period of time.
 *
 * This is usually used when either waiting for the game to update its state
 * or to prevent running in a tight loop.
 */
export async function idle() {
	return await sleep(IDLE_MS);
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
 * Return the current time plus a time duration.
 *
 * @param {number} duration_ms Duration in ms.
 */
export function date_add(duration_ms) {
	return new Date(Date.now() + duration_ms);
}

/**
 * Is this value a string?
 *
 * @param {any} value An unknown value.
 */
export function is_string(value) {
	return typeof value === 'string';
}

/**
 * Is this value a number?
 *
 * @param {any} value An unknown value.
 */
export function is_number(value) {
	return typeof value === 'number';
}

/**
 * Is this value a string?
 *
 * @param {any} value An unknown value.
 */
export function is_object(value) {
	return value !== null && typeof value === 'object';
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
	return vector_length([x1 - x2, y1 - y2]);
}

/**
 * Calculate the addition of two vectors.
 *
 * @param {number[]} v1 First vector.
 * @param {number[]} v2 Second vector.
 */
export function vector_add(v1, v2) {
	return v1.map((x, i) => x + v2[i]);
}

/**
 * Calculate the difference between two vectors.
 *
 * @param {number[]} v1 First vector.
 * @param {number[]} v2 Second vector.
 */
export function vector_difference(v1, v2) {
	return v1.map((x, i) => v2[i] - x);
}

/**
 * Calculate the distance between two vectors.
 *
 * @param {number[]} v1 First vector.
 * @param {number[]} v2 Second vector.
 */
export function vector_distance(v1, v2) {
	return vector_length(vector_difference(v1, v2));
}

/**
 * Resize a vector to fixed length.
 *
 * @param {number[]} v A vector.
 * @param {number} length New length
 * @returns {number[]} Normalized vector
 */
export function vector_resize(v, length) {
	return vector_scale(vector_normalize(v), length);
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

/**
 * Generate a 48-bit random identifier.
 *
 * @returns {string} 48-bit random hex-string (12 characters).
 */
export function random_id() {
	return Math.floor(Math.random() * Math.pow(2, 48)).toString(16)
}

/**
 * Return a random choice from an Array.
 *
 * @param {Array} choices Array of potential choices.
 * @returns Random selection from choices.
 */
export function random_choice(choices) {
	return choices[Math.floor(Math.random() * choices.length)];
}

/**
 * Split a string on whitespace.
 *
 * @param {string} str String.
 * @returns {string[]} Array of strings.
 */
export function split_whitespace(str) {
	return str.trim().split(/\s+/);
}

/**
 * Quantize a number to a multiple of `q`.
 *
 * @param {number} number The number.
 * @param {number} q Quantizing factor.
 * @returns {number} Quantized number.
 */
export function quantize(number, q) {
	return Math.floor(number / q) * q;
}

/**
 * A mod B.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number} `a` mod `b`
 */
export function modulo(a, b) {
	return ((a % b) + b) % b;
}
