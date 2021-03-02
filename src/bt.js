// Behavor Tree
import * as Util from '/util.js';

/** Sequence of tasks. */
function sequence(...tasks) {
	return async () => {
		for (let task of tasks) {
			if (!await task()) {
				return false;
			}
		}

		return true;
	};
}

/** Selector of tasks. */
function fallback(...tasks) {
	return async () => {
		for (let task of tasks) {
			if (await task()) {
				return true;
			}
		}

		return false
	};
}

/** Decorator that makes a task always succeeed. */
function success(task) {
	return async () => {
		await task();
		return true;
	};
}

/** Pause a task for `ms` milliseconds. */
function pause(task, ms) {
	return async () => {
		await Util.sleep(ms);
		return await task();
	};
}

/** Task to select nearest monster. */
function target_nearest_monster() {
	return async () => {
		let target = get_nearest_monster();
		change_target(target);

		return target != null;
	};
}

/** Task to move to target. */
function move_to_target() {
	return async () => {
		let target = get_target();
		if (!target) {
			return false;
		}

		await xmove(target.real_x, target.real_y);
		return true;
	};
}

/** Task ticker that ticks every `interval_ms` milliseconds. */
async function tick(task, interval_ms) {
	while (true) {
		await task(),
		await Util.sleep(interval_ms)
	}
}

function main() {
	// Task to respawn 15 seconds after death.
	const respawn_task = sequence(
		() => character.rip,
		pause(success(respawn), 15_000)
	);

	// Task to loot chests.
	const looting_task = success(loot);

	// Task to regen HP using potions.
	const regen_hp_task = sequence(
		() => character.hp < character.max_hp,
		() => !is_on_cooldown('use_hp'),
		fallback(
			sequence(
				() => character.hp < character.max_hp - 200 && locate_item('hpot0') != -1,
				success(() => use_skill('use_hp')),
			),
			success(() => use_skill('regen_hp')),
		)
	);

	// Task to regen MP using potions.
	const regen_mp_task = sequence(
		() => character.mp < character.max_mp,
		() => !is_on_cooldown('use_mp'),
		fallback(
			sequence(
				() => character.mp < character.max_mp - 300 && locate_item('mpot0') != -1,
				success(() => use_skill('use_mp')),
			),
			success(() => use_skill('regen_mp')),
		)
	);

	// Task to regen HP or MP.
	const regen_task = fallback(
		sequence(
			() => character.mp > 50,
			regen_hp_task,
		),
		regen_mp_task,
	);

	// Task to find and attack monsters.
	const attack_task = sequence(
		fallback(
			() => get_targeted_monster() != null,
			target_nearest_monster(),
		),
		fallback(
			() => is_in_range(get_target()),
			move_to_target(),
		),
		() => can_attack(get_target()),
		async () => await attack(get_target()),
	);

	tick(respawn_task, 1_000).catch(e => console.log('Respawn task failed:', e));
	tick(looting_task, 1_000).catch(e => console.log('Looting task failed:', e));
	tick(regen_task, 250).catch(e => console.log('Attack task failed:', e));
	tick(attack_task, 250).catch(e => console.log('Attack task failed:', e));
}

main()
