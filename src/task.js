// Task functions.
// @ts-check

/** Thrown when a task has been cancelled. */
class CancelledError extends Error {
	constructor() {
		super();
	}
}

/**
 * @callback Async
 * @param {Task} task Reference to parent Task.
 * @return {Promise} Resolves with the result of the Task.
 */

/**
 * A cancelable Task.
 *
 * The Task should regularly check `task.is_cancelled()` to determine
 * if it has been cancelled. Failing to do so will result in the Task
 * running longer than required and still having its result discarded.
 */
class Task {
	/**
	 * Create a new Task based on an `async` function.
	 *
	 * @param {Async} task Async function that implements this task.
	 */
	constructor(task) {
		this._state = Task.RUNNING;
		this._result = null;
		this._waiters = [];

		// Immediately schedule the async
		task(this).then(result => {
			if (this.is_cancelled()) {
				result = new CancelledError();
			} else {
				this._result = result;
				this._state = Task.SUCCEEDED;
			}

			// Call waiters
			for (let waiter of this._waiters) {
				waiter.resolve(result);
			}
			this._waiters = []
		}).catch(result => {
			if (this.is_cancelled()) {
				result = new CancelledError();
			} else {
				this._result = result;
				this._state = Task.FAILED;
			}

			// Call waiters
			for (let waiter of this._waiters) {
				waiter.reject(result);
			}
			this._waiters = []
		});
	}

	/** Has the task completed. */
	is_done() {
		return this._state === Task.FAILED || this._state === Task.SUCCEEDED || this._state === Task.CANCELLED;
	}

	/** Has the task been cancelled. */
	is_cancelled() {
		return this._state === Task.CANCELLED;
	}

	/**
	 * Cancel execution of this Task.
	 *
	 * @returns {boolean} `true` if the task could be cancelled, otherwise `false`.
	 * */
	cancel() {
		if (this.is_done()) {
			return false;
		}

		this._state = Task.CANCELLED;
		return true;
	}

	/**
	 * Get the result of this Task.
	 *
	 * @returns {Promise<any,Error>}
	 */
	result() {
		return new Promise((resolve, reject) => {
			switch (this._state) {
				case Task.FAILED:
					reject(this._result);
					return;

				case Task.SUCCEEDED:
					resolve(this._result);
					return;

				case Task.CANCELLED:
					reject(new CancelledError());
					return;

				default:
					this._waiters.push({resolve: resolve, reject: reject});
					return;
			}
		});
	}
}

Task.RUNNING = 'Running';
Task.CANCELLED = 'Cancelled';
Task.FAILED = 'Failed';
Task.SUCCEEDED = 'Succeeded';

/**
 * Create a new Task.
 *
 * @param {Async} task Async function that implements this task.
 * @returns {Task}
 */
export function create(task) {
	return new Task(task);
}
