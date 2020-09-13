// Brain base class
// @ts-check
import * as Adventure from '/adventure.js';
import * as Character from '/character.js';
import * as Entity from '/entity.js';
import * as Logging from '/logging.js';
import * as Util from '/util.js';

const character = Character.get_character();

export class Brain {
	static IDLE_MS = 250;
	static SLEEP_MS = 1000;

	constructor() {
		this._deserialize_state();
		this.target = null;
		this.target_difficulty = 0;
		this.home = null;
	}

	/**
	 * Deserialize character state.
	 */
	_deserialize_state() {
		this.state = JSON.parse(window.sessionStorage.getItem('c:' + character.name)) || {};
	}

	/**
	 * Serialize character state.
	 */
	_serialize_state() {
		window.sessionStorage.setItem('c:' + character.name, JSON.stringify(this.state));
	}

	/**
	 * Are we interrupted from normal flow?
	 */
	is_interrupted() {
		return this.stopped || character.rip;
	}

	get stopped() {
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
		Adventure.set('stopped', false);
		this.state.stopped = false;
	}

	/**
	 * Loop until interupted.
	 *
	 * @param {Function} func Function to call.
	 */
	async loop_until_interrupted(func) {
		let t = Date.now();
		while (!this.is_interrupted()) {
			if (await func() === false) {
				break;
			};

			// Ensure we don't spin too fast
			const t_delta = Date.now() - t;
			if (t_delta < Brain.IDLE_MS) {
				await Util.sleep(Brain.IDLE_MS - t_delta);
			}
			t = Date.now();
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
			await Util.sleep(remaining > 1 ? 250 : remaining * Util.SECOND_MS);
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
		await this._init();
		await this._loop();
	}

	/**
	 * Initialize brain.
	 */
	async _init() {
		Logging.info(`Starting ${this} brain`);
	}

	/**
	 * Main loop.
	 */
	async _loop() {
		let t = Date.now();
		let tick = 1;
		do {
			Logging.debug('tick', tick++);
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

			this._serialize_state();

			// Avoid a runaway loop
			const t_delta = Date.now() - t;
			if (t_delta < Brain.IDLE_MS) {
				await Util.sleep(Brain.IDLE_MS - t_delta);
			}
			t = Date.now();
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

		Adventure.respawn();
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
}
