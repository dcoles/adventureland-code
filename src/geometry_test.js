// Test Geometry related functions
// @ts-check
import * as Color from '/color.js';
import * as Geometry from '/geometry.js';
import * as Util from '/util.js';

const S = 8;
const WIDTH = 20;

/**
 * Try to move to position, if possible.
 *
 * @param {number} x x map-coordinate.
 * @param {number} y y map-coordinate.
 */
window.on_map_click = function(x, y) {
	if (Geometry.can_move([character.x, character.y, character.map], [x, y, character.map])) {
		move(x, y).then(_ => {
			clear_drawings();
			draw_grid();
		});
	}

	return true;
}

/**
 * Main.
 */
function main() {
	set_message('Test');

	draw_lines();
	draw_grid();
}

/**
 * Draw "can-move" grid.
 */
function draw_grid() {
	const here = [character.x, character.y, character.map];
	console.log('Drawing Grid...')

	// Built-in can-move
	console.time('builtin');
	for (let i = -WIDTH; i < WIDTH; i++) {
		for (let j = -WIDTH; j < WIDTH; j++) {
			const there = [Util.quantize(here[0], S) + S * i, Util.quantize(here[1], S) + S * j, here[2]];
			if (can_move_to(there[0], there[1])) {
				draw_circle(there[0], there[1], 3, null, Color.BLUE);
			} else {
				draw_circle(there[0], there[1], 1, null, Color.RED);
			}
		}
	}
	console.timeEnd('builtin');

	// Our move
	console.time('our');
	for (let i = -WIDTH; i < WIDTH; i++) {
		for (let j = -WIDTH; j < WIDTH; j++) {
			const there = [Util.quantize(here[0], S) + S * i, Util.quantize(here[1], S) + S * j, here[2]];
			if (Geometry.can_move(here, there)) {
				draw_circle(there[0], there[1], 2, null, Color.GREEN);
			} else {
				draw_circle(there[0], there[1], 1, null, Color.RED);
			}
		}
	}
	console.timeEnd('our');
}

/**
 * Draw all boundary lines on this map.
 */
export function draw_lines() {
	// Horizontal lines
	for (let y_line of G.geometry[character.map].y_lines) {
		const y = y_line[0];
		const x1 = y_line[1];
		const x2 = y_line[2];

		draw_line(x1, y, x2, y, null, Color.RED);
	}

	// Vertical lines
	for (let x_line of G.geometry[character.map].x_lines) {
		const x = x_line[0];
		const y1 = x_line[1];
		const y2 = x_line[2];

		draw_line(x, y1, x, y2, null, Color.RED);
	}
}

try {
	main();
} catch (e) {
	console.error('Unhandled exception', e);
}
