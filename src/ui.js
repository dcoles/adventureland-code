// UI functions
// @ts-check
import * as Task from '/task.js';
import * as Util from '/util.js';

const STATUS_WIDTH = 12;
const NBSP = '\u00A0';

/**
 * Status message ticker.
 *
 * This can be used to display long text.
 *
 * @param {string} msg Status message.
 * @param {Promise} future A promise that will be resolved in the future.
 */
export async function busy(msg, future) {
	const t = Task.create(async task => {
		for (let n = 0; !task.is_cancelled(); n = (n + 1) % 4) {
			set_message(`${msg.padStart(3 - n, NBSP)}${'.'.repeat(n)}`);
			await Util.sleep(Util.IDLE_MS);
		}
	});

	try {
		return await future;
	} finally {
		t.cancel();
	}
}

/**
 * Busy status message.
 *
 * This is used to show that CODE is busy.
 *
 * @param {string} msg Status message.
 * @param {Promise} future A promise that will be resolved in the future.
 */
export async function ticker(msg, future) {
	msg = `${msg}${NBSP}${NBSP}`.padEnd(STATUS_WIDTH, NBSP);
	const t = Task.create(async task => {
		for (let n = 0; !task.is_cancelled(); n = (n + 1) % msg.length) {
			set_message(`${msg.slice(n)}${msg.slice(0, n)}`.slice(0, STATUS_WIDTH));
			await Util.sleep(Util.IDLE_MS);
		}
	});

	try {
		return await future;
	} finally {
		t.cancel();
	}
}
