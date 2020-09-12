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
		this.stopped = !character.bot && Adventure.get('stopped') || false;
		this.target = null;
		this.target_difficulty = 0;
		this.home = null;
	}

	/**
	 * Are we interrupted from normal flow?
	 */
	is_interrupted() {
		return this.stopped || character.rip;
	}

	/**
	 * Stop the event loop.
	 */
	stop() {
		Logging.warn('Stopping event loop');
		Adventure.set('stopped', true);
		this.stopped = true;

		// Cease all motor functions
		character.stop_all();
	}

	/** Resume the event loop. */
	resume() {
		Logging.warn('Resuming event loop');
		Adventure.set('stopped', false);
		this.stopped = false;
	}

	/**
	 * Loop until interupted.
	 *
	 * @param {Function} func Function to call.
	 */
	async loop_until_interrupted(func) {
		while (!this.is_interrupted()) {
			if (await func() === false) {
				break;
			};

			await this._idle();
		}
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
		do {
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
				this.stop();
				continue;
			}

			// Avoid a runaway loop
			await this._idle();
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
		for (let n = 15; n > 0; n--) {
			if (!character.rip) {
				return;
			}

			set_message(`RIP (${n})`);
			await this._sleep(1000);
		}

		Adventure.respawn();
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
		await this._sleep(Brain.SLEEP_MS);
	}
}
