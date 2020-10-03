// Task functions.
// @ts-check

/** Thrown when a task has been cancelled. */
export class CancelledError extends Error {
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
export class Task {
	/**
	 * Create a new Task based on an `async` function.
	 *
	 * @param {Async} task Async function that implements this task.
	 */
	constructor(task) {
		this._state = Task.RUNNING;
		this._task = task(this).then((result, error) => {
			if (this.is_cancelled()) {
				throw new CancelledError();
			} else if (error) {
				this._state = Task.FAILED;
				throw error;
			} else {
				this._state = Task.SUCCEEDED;
				return result;
			}
		});
	}

	/**
	 * Thenable.
	 *
	 * @param {*} fulfilled Value if fulfilled.
	 * @param {*} rejected Value if rejected.
	 * @returns {PromiseLike} Chained promise.
	 */
	then(fulfilled, rejected) {
		return this._task.then(fulfilled, rejected);
	}

	/** Is the task running? */
	is_running() {
		return this._state === Task.RUNNING;
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
