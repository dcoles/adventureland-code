// General logging functions
// Usage:
//   import * as log from './log.js';
//
// @ts-check

const LOG_COLORS = {
	debug: 'gray',
	info: '',
	warn: 'orange',
	error: 'red',
}

export const ERROR = 'error';
export const WARN = 'warn';
export const INFO = 'info';
export const DEBUG = 'debug';

/**
 * Log at ERROR level.
 *
 * @param {string} text Log text.
 * @param {object} [obj] Additional object for context.
 */
export function error(text, obj) {
	log('error', text, obj);
}

/**
 * Log at WARN level.
 *
 * @param {string} text Log text.
 * @param {object} [obj] Additional object for context.
 */
export function warn(text, obj) {
	log('warn', text, obj);
}

/**
 * Log at INFO level.
 *
 * @param {string} text Log text.
 * @param {object} [obj] Additional object for context.
 */
export function info(text, obj) {
	log('info', text, obj);
}

/**
 * Log at DEBUG level.
 *
 * @param {string} text Log text.
 * @param {object} [obj] Additional object for context.
 */
export function debug(text, obj) {
	log('debug', text, obj);
}

/**
 * Generic log function.
 *
 * @param {ERROR | WARN | DEBUG | INFO} level Debug level.
 * @param {string} text Text for log message.
 * @param {object} [obj] Additional object for context.
 */
export function log(level, text, obj) {
	const color = LOG_COLORS[level] || '';
	const name = window.character.bot ? window.character.name : 'main';
	const prefix = `[${level.toUpperCase()}] <${name}>`;

	if (obj) {
		console[level]('%c%s %s: %o', `color: ${color}`, prefix, text, obj);
	} else {
		console[level]('%c%s %s', `color: ${color}`, prefix, text);
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
