// UI functions
// @ts-check
import * as Util from '/util.js';

/**
 * Add a button to the top of the UI.
 *
 * @param {string} text Button text.
 * @param {Function} [on_click] Optional on-click handler.
 * @returns {HTMLElement} Button HTML element.
 */
export function add_top_button(text, on_click) {
	const id = Util.random_id();
	window.add_top_button(id, on_click);

	const element = get_button_by_id(id);
	if (!element) {
		console.warn(`Could not find .codebutton${id} HTML element`);
		return;
	}

	element.textContent = text;
	return element;
}

/**
 * Add a button to the bottom of the UI.
 *
 * @param {string} text Button text.
 * @param {Function} [on_click] Optional on-click handler.
 * @returns {HTMLElement} Button HTML element.
 */
export function add_bottom_button(text, on_click) {
	const id = Util.random_id();
	window.add_bottom_button(id, on_click);

	const element = get_button_by_id(id);
	if (!element) {
		console.warn(`Could not find .codebutton${id} HTML element`);
		return;
	}

	element.textContent = text;
	return element;
}

/**
 * Remove button from UI.
 *
 * @param {HTMLElement|string} element_or_id HTML element or unique button ID.
 */
export function remove_button(element_or_id) {
	const element = typeof element_or_id === 'string' ? get_button_by_id(element_or_id) : element_or_id;
	const id = button_id(element);
	if (!(id in window.buttons)) {
		return;
	}

	element.remove();
	delete window.buttons[id];
}

/**
 * Get button ID from HTML element.
 *
 * @param {HTMLElement} element HTML element.
 */
export function button_id(element) {
	return element.dataset.id;
}

/**
 * Get button by ID.
 *
 * @param {string} id Unique ID.
 * @returns {HTMLElement}
 */
export function get_button_by_id(id) {
	return parent.document.querySelector('.codebutton' + id);
}
