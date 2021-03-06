// Behavor Tree
import * as Util from '/util.js';
import * as Logging from '/logging.js';

class Node {
	/**
	 * Tick this node.
	 *
	 * @returns {Promise<"success"|"failure"|"running">}
	 */
	async tick() {
		return Node.SUCCESS;
	}
}

Node.SUCCESS = "success";
Node.FAILURE = "failure";
Node.RUNNING = "running";

/** Tick nodes in sequence, returning FAILURE on the first failed node; otherwise SUCCESS. */
class Sequence extends Node {
	constructor(...children) {
		super();
		this.children = children;
	}

	async tick() {
		for (let child of this.children) {
			const status = await child.tick();
			switch (status) {
				case Node.RUNNING:
				case Node.FAILURE:
					return status;
				case Node.SUCCESS:
					continue;
				default:
					throw Error('Unknown status: ' + status);
			}
		}
		return Node.SUCCESS;
	}
}

/** Tick nodes in sequence, returning SUCCESS on the first successful node; otherwise FAILURE. */
class Fallback extends Node {
	constructor(...children) {
		super();
		this.children = children;
	}

	async tick() {
		for (let child of this.children) {
			const status = await child.tick();
			switch (status) {
				case Node.RUNNING:
				case Node.SUCCESS:
					return status;
				case Node.FAILURE:
					continue;
				default:
					throw Error('Unknown status: ' + status);
			}
		}
		return Node.FAILURE;
	}
}

/** Tick nodes in parallel, returning FAILURE if any node fails; otherwise SUCCESS. */
class Parallel extends Node {
	constructor(...children) {
		super()
		this.children = children;
	}

	async tick() {
		const statuses = await Promise.all(this.children.map(c => c.tick()));
		let result = Node.SUCCESS;
		for (let status of statuses) {
			switch (status) {
				case Node.FAILURE:
					return Node.FAILURE;
				case Node.RUNNING:
					result = Node.RUNNING;
			}
		}
		return result;
	}
}

/** A condition that returns either SUCCESS or FAILURE. */
class Condition extends Node {
	constructor(condition) {
		super();
		this.condition = condition;
	}

	async tick() {
		if (this.condition()) {
			return Node.SUCCESS;
		} else {
			return Node.FAILURE;
		}
	}
}

/** A decorator for other nodes. */
class Decorator extends Node {
	constructor(child) {
		super();
		this.child = child;
	}

	async tick() {
		return await this.child.tick();
	}
}

/** Decorator that ticks a node until it fails. */
class RepeatUntilFailure extends Decorator {
	async tick() {
		const status = await this.child.tick();
		switch (status) {
			case Node.RUNNING:
			case Node.SUCCESS:
				return Node.RUNNING;
			case Node.FAILURE:
				return Node.FAILURE;
			default:
				throw Error('Unknown status: ' + status);
		}
	}
}

/** Wait for `skill_id` to be ready. */
class WaitForSkillReady extends Node {
	constructor(skill_id) {
		super();
		this.skill_id = skill_id;
	}

	async tick() {
		if (is_on_cooldown(this.skill_id)) {
			return Node.RUNNING;
		} else {
			return Node.SUCCESS;
		}
	}
}

/** Attempt to use `skill_id`. */
class UseSkill extends Node {
	constructor(skill_id) {
		super();
		this.skill_id = skill_id;
	}

	async tick() {
		const target = get_target();

		switch (this.skill_id) {
			case 'attack':
				attack(target);
				break;
			case 'heal':
				heal(target);
				break;
			default:
				use_skill(this.skill_id, target);
		}

		// Give time for timers to update
		Util.idle();

		return Node.SUCCESS;
	}
}

/** Attempot to target nearest monster. */
class TargetNearestMonster extends Node {
	async tick() {
		const target = get_nearest_monster();
		change_target(target);

		return target !== null ? Node.SUCCESS : Node.FAILURE;
	}
}

/** Attempt to move to target. */
class MoveTo extends Node {
	constructor(target) {
		super();
		this.target = target;
	}

	async tick() {
		const target = this.target ?? get_target();
		if (!target) {
			return Node.SUCCESS;
		}

		try {
			await xmove(target.x, target.y);
		} catch (e) {
			Logging.warn('MoveTo failed', e);
			return Node.FAILURE;
		}

		return Node.SUCCESS;
	}
}

class Respawn extends Node {
	async tick() {
		Logging.info('Respawning in 15 seconds...');

		await Util.sleep(15_000);
		respawn();
		await Util.sleep(1_000);

		return Node.SUCCESS;
	}
}

class Loot extends Node {
	async tick() {
		loot();

		return Node.SUCCESS;
	}
}

class Idle extends Node {
	async tick() {
		set_message('IDLE');
		return Node.RUNNING;
	}
}

/**
 * Node ticker.
 *
 * @param {Node} child Node to tick.
 * @param {number?} interval_ms Tick interval in milliseconds.
 */
class Root extends Node {
	constructor(child, interval_ms) {
		super()
		this.child = child;
		this.interval_ms = interval_ms ?? 250;
		this.running = false;
	}

	async tick() {
		return await this.child.tick();
	}

	async run() {
		this.running = true;
		while (this.running) {
			await this.tick();
			await Util.sleep(this.interval_ms)
		}
	}
}

/** Is target dead? */
function is_dead(target) {
	!target || target.dead
}

function main() {
	const regen_hp_task = new Fallback(
		new Condition(() => character.hp == character.max_hp),
		new RepeatUntilFailure(
			new Sequence(
				new WaitForSkillReady('use_hp'),
				new Fallback(
					new Sequence(
						new Condition(() => character.hp < character.max_hp - 200),
						new Condition(() => locate_item('hpot0') != -1),
						new UseSkill('use_hp'),
					),
					new UseSkill('regen_hp')
				)
			)
		)
	);

	const regen_mp_task = new Fallback(
		new Condition(() => character.mp == character.max_mp),
		new RepeatUntilFailure(
			new Sequence(
				new WaitForSkillReady('use_hp'),
				new Fallback(
					new Sequence(
						new Condition(() => character.hp < character.max_hp - 200),
						new Condition(() => locate_item('mpot0') != -1),
						new UseSkill('use_mp'),
					),
					new UseSkill('regen_mp')
				)
			)
		)
	);

	const attack_task = new Fallback(
		new Condition(() => is_dead(get_target())),
		new Sequence(
			new Condition(() => is_in_range(get_target())),
			new RepeatUntilFailure(
				new Sequence(
					new WaitForSkillReady('attack'),
					new UseSkill('attack'),
				),
			),
		),
		new MoveTo(),
	);

	const find_monster_task = new Fallback(
		new Condition(() => get_targeted_monster()),
		new Sequence(
			new Condition(() => character.hp / character.max_hp > 0.8),
			new TargetNearestMonster(),
		),
	);

	const main_task = new Sequence(
		// Respawn on death
		new Fallback(
			new Condition(() => !character.rip),
			new Respawn(),
		),

		new Parallel(
			// Looting
			new Loot(),

			// HP/MP regeneration
			new Sequence(
				new Fallback(
					new Condition(() => character.mp / character.max_mp > 0.2),
					regen_mp_task,
				),
				regen_hp_task,
				regen_mp_task,
			),

			// Attack
			new Sequence(
				find_monster_task,
				attack_task,
			),
		),
	);

	const root = new Root(main_task);
	root.run().catch(e => Logging.error('Main task failed', e));
}

main()
