// General utility functions
// @ts-check

/**
 * Promise that resolves after timeout.
 * 
 * @param {number} ms Timeout in milliseconds.
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
