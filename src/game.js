// Game related functions
// @ts-check

/**
 * Next event from server.
 *
 * @param {string} name Event name.
 * @param {Function} [condition] Optional condition for event.
 * @returns {Promise} Resolves to event data when event condition is met.
 */
export function next_event(name, condition) {
	return new Promise(resolve => {
		function on(data) {
			if (!condition || condition(data)) {
				parent.socket.off(name, on);
				resolve(data);
			}
		}

		parent.socket.on(name, on);
	});
}
