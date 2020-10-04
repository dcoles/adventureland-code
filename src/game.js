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
	return new Promise((resolve, reject) => {
		const socket = parent.socket;

		function on(data) {
			var triggered;
			try {
				triggered = !condition || condition(data);
			} catch (e) {
				socket.off(name, on);
				reject(e);
				return;
			}

			if (!triggered) {
				return;
			}

			socket.off(name, on);
			resolve(data);
		}

		socket.on(name, on);
	});
}
