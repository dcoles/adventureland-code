// Useful widgets
// @ts-check

/**
 * Monitor a character stat and display the rate.
 *
 * Calculates an weighted moving average over `n` samples.
 *
 * @param {string} stat_name Stat name (e.g. 'xp').
 * @param {number} [t=1] Time interval (seconds).
 * @param {number} [window_duration=600] Sample window in seconds (default: 10m).
 */
export function stat_monitor(stat_name, t, window_duration) {
	if (character.bot) {
		return;
	}

	t = t || 1;
	window_duration = window_duration || 600;
	const n = Math.floor(window_duration / t);  // Number of samples in window
	let last = character[stat_name];
	let values = [];
	window.setInterval(() => {
		const current = character[stat_name];
		const per_second = (current - last) / t;

		// Weighted moving average over `n` samples
		if (values.push(per_second) > n) {
			values.shift();
		}
		const avg_per_hour = 3600 * values.reduce((a, b) => a + b) / n;

		// Show at bottom of the UI
		window.add_bottom_button(stat_name + '_rate', `${stat_name.toUpperCase()}/h: ${Math.round(avg_per_hour)}`);
		last = current;
	}, t * 1000);
}
