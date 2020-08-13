// Common functions
// @ts-check

import { sleep } from "./util.js";

const ORIGIN = { x: 0, y: 0 };
const TOWN_RADIUS = 600;  // px

/**
 * Is the target in Town?
 *
 * @param {object} [target=character] Target to check.
 * @returns {boolean} True if the target is in town, otherwise False.
 **/
export function is_in_town(target) {
	target = target || character;
	return distance(target, ORIGIN) < TOWN_RADIUS;
}

/**
 * Move towards a target.
 *
 * @param {object} target Target to move towards.
 **/
export async function move_towards(target) {
	// Walk half the distance (or until in range)
	const dist = distance(character, target);
	const dx = (target.x - character.x) / dist;
	const dy = (target.y - character.y) / dist;

	const movement_dist = Math.min(dist / 2, character.range);
	move(character.x + movement_dist * dx, character.y + movement_dist * dy);
	await sleep(movement_time(movement_dist));
}

/**
 * Get nearest monster.
 *
 * @param {object} [criteria] Criteria for matching monster.
 * @param {Set} [criteria.valid] Set of valid monster types (default: All monsters)
 * @param {boolean} [criteria.min_xp] Minimum XP of monsters to target (default: `1`)
 * @param {boolean} [criteria.path_check] Checks if the character can move to the target (default: `false`)
 */
export function get_nearest_monster(criteria) {
	criteria = criteria || {};
	let target = null;
	let target_distance = Infinity;
	const min_xp = criteria.min_xp || 1;  // don't kill puppies

	for (let [id, entity] of Object.entries(parent.entities)) {
		if (entity.type !== 'monster') continue;
		if (criteria.valid && !criteria.valid.has(entity.mtype)) continue;
		if (entity.xp < min_xp) continue;
		if (criteria.path_check && !can_move_to(entity)) continue;

		const distance = parent.distance(character, entity);
		if (distance > target_distance) continue;

		target = entity;
		target_distance = distance;
	}

	return target;
}

/**
 * Move directly away from target.
 *
 * @param {object} target Target to retreat from.
 * @param {number} retreat_dist Distance to retreat (in pixels).
 */
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

/** Calculate time for target to move a certain distance
 *
 * @param {object} target Target to measure.
 * @param {number} distance Distance target will move.
 * @returns {number} Duration in milliseconds.
*/
export function movement_time(target, distance) {
	return distance / target.speed * 1000;
}
