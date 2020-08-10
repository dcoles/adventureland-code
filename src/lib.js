// Common functions

import {
	sleep_until, sleep,
} from "./util.js";

const ORIGIN = { x: 0, y: 0 };
const TOWN_RADIUS = 600;
const HP_REGEN = 50;
const MP_REGEN = 100;
const MIN_MP = 100;

/** Is the target in Town? */
export function is_in_town(target) {
	return simple_distance(target, ORIGIN) < TOWN_RADIUS;
}

/** Try to regenerate health/mana if possible. */
export function regen_hp_or_mp() {
	let action = null;

	if (character.mp < MIN_MP) {
		action = 'mp';
	} else if (character.hp < character.max_hp - HP_REGEN) {
		action = 'hp';
	} else if (character.mp < character.max_mp - MP_REGEN) {
		action = 'mp';
	}

	if (action && !is_on_cooldown('use_' + action)) {
		use_skill('regen_' + action);
	}
}

/** Move towards a target. */
export async function move_towards(target) {
	// Walk half the distance (or until in range)
	const dist = distance(character, target);
	const dx = (target.x - character.x) / dist;
	const dy = (target.y - character.y) / dist;

	const movement_dist = min(dist / 2, character.range);
	move(character.x + movement_dist * dx, character.y + movement_dist * dy);
	await sleep(movement_time(movement_dist));
}

/**
 * Get nearest monster.
 *
 * @param {object} args Additional options
 * @param {Set} args.valid Set of valid monster types (default: All monsters)
 * @param {boolean} args.min_xp Minimum XP of monsters to target
 * @param {boolean} args.path_check Checks if the character can move to the target
 */
export function get_nearest_monster(args) {
	let target = null;
	let target_distance = Infinity;

	for (let [id, entity] of Object.entries(parent.entities)) {
		if (entity.type !== 'monster') continue;
		if (args.valid && !args.valid.has(entity.mtype)) continue;
		if (args.min_xp && entity.xp < args.min_xp) continue;
		if (args.path_check && !can_move_to(entity)) continue;

		const distance = parent.distance(character, entity);
		if (distance > target_distance) continue;

		target = entity;
		target_distance = distance;
	}

	return target;
}

/** Move directly away from target */
export async function retreat(target, retreat_dist) {
	// Calculate unit-vector
	const target_dist = distance(character, target);
	const dx = (character.x - target.x) / target_dist;
	const dy = (character.y - target.y) / target_dist;

	// How far we have to retreat
	const dist = Math.max(retreat_dist - target_dist, 0);

	// Retreat `retreat_dist` directly away
	move_towards({
		x: character.x + dist * dx,
		y: character.y + dist * dy
	});

	// Wait for us to finish
	await sleep(movement_time(character, dist));
}

/** Time for target to move distance in milliseconds */
export function movement_time(target, distance) {
	return distance / target.speed * 1000;
}

/** Sleep until skill is ready to use (off cooldown) */
export async function sleep_until_ready(skill) {
	await sleep_until(parent.next_skill[skill]);
}
