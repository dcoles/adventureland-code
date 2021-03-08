// Brain base class
// @ts-check
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Logging from '/logging.js';
import * as Task from '/task.js';
import * as Util from '/util.js';

const character = Character.get_character();

export class Brain {
	static IDLE_MS = Util.IDLE_MS;
	static SLEEP_MS = Util.SECOND_MS;
	static STATE_UPDATE_MS = Util.SECOND_MS;

	/**
	 * Get current character information of another character.
	 *
	 * @param {string} name Character name.
	 */
	static get_character(name) {
		let state = Brain.get_state(name);
		if (state && state.character) {
			return state.character;
		}

		// Fall back to built-in state
		return window.get_characters().find((c) => c.name === name);
	}

	/**
	 * Get brain state of another character.
	 *
	 * @param {string} name Character name.
	 */
	static get_state(name) {
		let state = JSON.parse(window.localStorage.getItem('c:' + name));
		if (!state || state.last_update < Date.now() - Util.MINUTE_MS) {
			return null;
		}

		return state;
	}

	constructor() {
		this.state = {};
		this.interrupt = false;
		this.target = null;
		this.target_difficulty = 0;
		this.home = null;
		this.tasks = {};
	}

	/**
	 * Are we interrupted from normal flow?
	 */
	is_interrupted() {
		return this.interrupt || this.stopped || character.rip;
	}

	get stopped() {
		// Bots are never stopped
		if (character.bot) {
			return false;
		}

		return this.state.stopped || false;
	}

	/**
	 * Stop the event loop.
	 */
	stop() {
		Logging.warn('Stopping event loop');
		this.state.stopped = true;

		// Cease all motor functions
		character.stop_all();
	}

	/** Resume the event loop. */
	resume() {
		Logging.warn('Resuming event loop');
		this.state.stopped = false;
	}

	/**
	 * Create a long running task.
	 *
	 * Creating a new task with the same name will result in the old task being cancelled.
	 *
	 * @param {string} name Task name.
	 * @param {Task.Async} body Task body.
	 */
	create_task(name, body) {
		if (this.tasks[name]) {
			this.tasks[name].cancel();
		}

		const task = Task.create(body);
		this.tasks[name] = task;
		return task;
	}

	/**
	 * Loop until interupted.
	 *
	 * @param {Function} func Function to call.
	 */
	async loop_until_interrupted(func) {
		const regulator = new Util.Regulator();
		while (!this.is_interrupted()) {
			// Ensure we don't spin too fast
			await regulator.regulate();

			if (await func() === false) {
				break;
			};
		}
	}

	/**
	 * Countdown until a certain time or interrupted.
	 *
	 * @param {Date} until Time to count down to.
	 * @param {string} [message] Status message.
	 */
	async countdown(until, message) {
		message = message || 'Countdown';

		Logging.info(`${message} until`, until);
		const until_ts = until.getTime();

		await this.loop_until_interrupted(async () => {
			const now = Date.now();
			if (now > until_ts) {
				return false;
			}

			const remaining = (until_ts - now) / Util.SECOND_MS;
			window.set_message(`${message} (${remaining.toFixed()})`)
			await Util.sleep(remaining > 1 ? Util.IDLE_MS : remaining * Util.SECOND_MS);
		})
	}

	/** Set current target. */
	set_target(target) {
		if (!target) {
			this.target = null;
			this.target_difficulty = 0;
			return;
		}

		this.target = target;
		this.target_difficulty = Entity.difficulty(this.target);
		Logging.info(`Target: ${target.name} (${this.target_difficulty.toFixed(1)})`);
		character.change_target(target);
	}

	/**
	 * Run brain.
	 */
	async run() {
		await this._preinit();
		await this._init();
		await this._loop();
	}

	async _preinit() {
		Logging.info(`Starting ${this}`);
		this._deserialize_state();

		// Regularly update state
		window.setInterval(() => {
			try {
				this._update_state();
				this._serialize_state();
			} catch (e) {
				Logging.error('Exception updating state', e);
			}
		}, Brain.STATE_UPDATE_MS);
	}

	/**
	 * Deserialize character state.
	 */
	_deserialize_state() {
		this.state = JSON.parse(window.localStorage.getItem('c:' + character.name)) || {};
	}

	/**
	 * Update persistant character state.
	 */
	_update_state() {
		// Same values as `parent.X.characters`
		this.state.character = {
			name: character.name,
			type: character.ctype,
			level: character.level,
			in: character.in,
			map: character.map,
			x: character.real_x,
			y: character.real_y,
			online: true,  // TODO: Find out how to get online time
			server: window.server.region + window.server.id,
		}
		this.state.last_update = Date.now();
	}

	/**
	 * Serialize character state.
	 */
	_serialize_state() {
		window.localStorage.setItem('c:' + character.name, JSON.stringify(this.state));
	}

	/**
	 * Initialize brain.
	 *
	 * Called once.
	 */
	async _init() {
		// Override me!
	}

	/**
	 * Main loop.
	 */
	async _loop() {
		const regulator = new Util.Regulator();
		let tick = 1;
		do {
			// Avoid a runaway loop
			await regulator.regulate();

			Logging.debug('tick', tick++);
			this.interrupt = false;  // Clear interrupt

			if (this.stopped) {
				await this._stop();
				continue;
			}

			if (character.rip) {
				await this._rip();
			}

			try {
				await this._step();
			} catch (e) {
				Logging.error('Unhandled exception in Brain loop', e);
				window.set_message('Oops!', 'red');
				this.stop();
				continue;
			}
		} while (true);
	}

	/**
	 * Idle for a small period of time (typically 250ms).
	 *
	 * This is typically long enough for the game state to update.
	 */
	async _idle() {
		await this._sleep(Brain.IDLE_MS);
	}

	/**
	 * Sleep for a period of time.
	 *
	 * @param {number} [duration] Duration in milliseconds (default: 1 second).
	 */
	async _sleep(duration) {
		duration || Brain.SLEEP_MS;
		await Util.sleep(duration);
	}

	/**
	 * Behaviour when stopped.
	 */
	async _stop() {
		while (this.stopped) {
			window.set_message('Stop');
			await this._sleep();
		}
	}

	/**
	 * Behaviour when dead.
	 */
	async _rip() {
		const time_of_death = new Date();
		Logging.info(`Character died at ${time_of_death}`);

		character.stop_all();
		this.set_target(null);
		await this._respawn();
	}

	/**
	 * Respawn after short delay
	 */
	async _respawn() {
		// Respawn has 12-sec cooldown
		Logging.info('Respawning in 15s...')
		const until_ts = Date.now() + 15 * Util.SECOND_MS;

		let now;
		while ((now = Date.now()) < until_ts && character.rip) {
			const remaining = (until_ts - now) / Util.SECOND_MS;
			window.set_message(`RIP (${remaining.toFixed()})`)
			await Util.sleep(remaining > 1 ? 250 : remaining * Util.SECOND_MS);
		}

		respawn();
		while (character.rip) {
			await this._idle();
		}
	}

	/**
	 * Single step of brain logic.
	 *
	 * This is typically where most behaviour is defined.
	 */
	async _step() {
		// Override me!
		Logging.info('Nothing to do...');
		window.set_message('Nothing');
		await this._sleep();
	}

	toString() {
		return this.constructor.name;
	}
}
