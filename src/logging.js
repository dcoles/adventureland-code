// General logging functions
// Usage:
//   import * as log from './log.js';

const LOG_COLORS = {
	debug: 'gray',
	info: '',
	warn: 'orange',
	error: 'red',
}

/** Log at error level */
export function error(text, obj) {
	log('error', text, obj);
}

/** Log at warn level */
export function warn(text, obj) {
	log('warn', text, obj);
}

/** Log at info level */
export function info(text, obj) {
	log('info', text, obj);
}

/** Log at debug level */
export function debug(text, obj) {
	log('debug', text, obj);
}

/**
 * Generic log function.
 * 
 * @param {str} level One of 'error', 'warn', 'info', 'debug'
 * @param {str} text Text for log message
 * @param {object} obj Object to log
 */
export function log(level, text, obj) {
	const color = LOG_COLORS[level] || '';
	const prefix = level.toUpperCase();

	if (obj) {
		console[level]('%c[%s] %s: %o', `color: ${color}`, prefix, text, obj);
	} else {
		console[level]('%c[%s] %s', `color: ${color}`, prefix, text);
	}

	if (level === 'debug') {
		// Don't log debug in CODE console
		return;
	}

	if (!obj) {
		safe_log(text, color);
	} else if (obj instanceof Error) {
		safe_log(`${text}: ${obj.stack}`, color);
	} else {
		switch (obj.type) {
			case 'character':
			case 'monster':
			case 'skill':
				safe_log(`${text}: ${obj.name} [${obj.type}]`, color);
				break;
			default:
				safe_log(`${text}: ${obj}`, color);
		}
	}
}