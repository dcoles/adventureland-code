// General utility functions

/** Promise that resolves after timeout */
export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** Sleep until specific `Date` */
export async function sleep_until(date) {
	let now = Date.now();
	while (now <= date) {
		await sleep(date - now);
		now = Date.now();
	}
}