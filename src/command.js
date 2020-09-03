// Command handler
// @ts-check
import * as Logging from '/logging.js';
import * as Util from '/util.js';

const COMMANDS = {};

/**
 * Register a /command.
 *
 * @param {string} name Command name (e.g. "hello").
 * @param {Function} handler Command handler.
 * @param {string[]} required Required arguments.
 * @param {string[]} [optional] Optional arguments.
 */
export function register(name, handler, required, optional) {
	COMMANDS[name] = [handler, required, optional];
}

/**
 * Call registered command.
 *
 * @param {string} name Command name.
 * @param  {...any} args Command arguments.
 */
export function call(name, ...args) {
	if (!(name in COMMANDS)) {
		throw new Error(`No such command: ${name}`);
	}
	return COMMANDS[name][0](...args);
}

/**
 * Called when a `/command` is typed into the chat window.
 *
 * @param {string} command Command (e.g. 'wave').
 * @param {string} argstring Additional arguments.
 * @returns {boolean} True if argument was handled, false otherwise.
 */
window.handle_command = function(command, argstring) {
	if (!(command in COMMANDS)) {
		Logging.warn(`Unknown command: /${command}`);
		Logging.info(`Valid commands: ${Object.keys(COMMANDS).join(' ')}`);
		return false;
	}

	const [handler, required, optional] = COMMANDS[command];

	try {
		const args = parse_argstring(argstring, required, optional);
		handler.apply(null, args);
	} catch (e) {
		Logging.error(`/${command} failed: ${e.message}`);
	}

	return true;
}

/**
 * Parse an argument string.
 *
 * @param {string} argstring Argument string.
 * @param {string[]} [required] Required parameters.
 * @param {string[]} [optional] Optional parameters.
 */
function parse_argstring(argstring, required, optional) {
	argstring = argstring.trim()
	required = required || [];
	optional = optional || [];

	const min_args = required.length;
	const max_args = required.length + optional.length;
	const split = argstring !== '' ? Util.split_whitespace(argstring) : [];
	if (split.length < min_args || split.length > max_args) {
		if (optional.length > 0) {
			throw new TypeError(`Expected '${required.join(' ')} [${optional.join('] [')}]'`);
		} else {
			throw new TypeError(`Expected '${required.join(' ')}'`);
		}
	}

	const args = [];
	const split_len = split.length;
	for (let i=0; i < split_len; i++) {
		const arg = i < min_args ? required[i] : optional[i - min_args];
		const [name, type] = arg.split(':', 2);
		const value = split.shift();
		switch (type) {
			case 'int':
				const int = Number.parseInt(value);
				if (int === NaN) {
					throw new TypeError(`Expected integer for ${name}`);
				}
				args.push(int);
				break;

			case 'str':
			case undefined:
				args.push(value);
				break;

			default:
				throw new TypeError(`Unknown arg type for ${name}: ${type}`);
		}
	}

	return args;
}
