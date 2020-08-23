// Wrapper for AdventureLand functions.
// @ts-check

const DEBUG = true;

/**
 * Move to coordinates.
 *
 * @param {number} x x-coordinate
 * @param {number} y y-coordinate
 * @returns {Promise} Resolves when movement completes.
 */
export async function move(x, y) {
	let line = null;
	if (DEBUG) {
		line = window.draw_line(character.x, character.y, x, y);
	}

	const result = await window.move(x, y);

	if (line) {
		line.destroy();
	}

	return result;
}

/**
 * Change character's active target.
 *
 * @param {object} target New target.
 */
export function change_target(target) {
	if (!target) {
		return;
	}

	if (DEBUG) {
		let circle = window.draw_circle(target.x, target.y, target.range, null, 0xff0000);
		setTimeout(() => circle.destroy(), 500);
	}

	window.change_target(target);
}
