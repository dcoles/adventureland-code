// Webworker for pathfinding
// @ts-check
import * as Pathfind from '/pathfind.js';

onmessage = function(message) {
	const [type, id, data] = message.data;
	switch (type) {
		case 'update_context':
			Object.assign(self, data);
			break;
		case 'pathfind':
			console.time('pathfind');
			call(id, Pathfind.pathfind, data);
			console.timeEnd('pathfind');
			break;
		default:
			throw new TypeError(`Unknown message type: ${type}`)
	}
}

/**
 * Call a function then post the result as either a 'resolve' or 'reject' message.
 *
 * @param {string} id Job ID.
 * @param {Function} func Function to call.
 * @param {Array} args Function args.
 */
function call(id, func, args) {
	try {
		postMessage(['resolve', id, func.apply(null, args)]);
	} catch (e) {
		postMessage(['reject', id, e]);
	}
}

export function main() {
	console.info('Starting Pathfind worker');
}
