// Functions for working with entities.
// @ts-check

import * as Adventure from '/adventure.js';
import * as Util from '/util.js';

const character = Adventure.get_character();

/**
 * Filter criteria.
 *
 * @typedef {object} Criteria
 * @property {string} [name] Entity must have this name.
 * @property {"character"|"monster"} [type] Entity must match this type.
 * @property {string} [ctype] Entity must be of this class type.
 * @property {object|string} [target] Entity must be targetting this entity.
 * @property {boolean} [no_target] Entity must not have a target.
 * @property {boolean} [alive] If true, entity must be alive.
 * @property {boolean} [owner] If true, entity must be owned by us.
 * @property {boolean} [party] If true, entity must be in our party.
 * @property {number} [min_xp] Entity must give at least this much XP.
 * @property {boolean} [path_check] Entity must be directly reachable.
 * @property {Function} [filter] General-purpose filter function.
 */

/**
 * Return nearest monsters.
 *
 * @param {Criteria} [criteria] Criteria for matching monster.
 * @returns {Array<Monster>} Monsters ordered from nearest to furthest away.
 */
export function get_nearby_monsters(criteria) {
	criteria = criteria || {};
	return get_entities({...criteria, type: 'monster', min_xp: 1}).sort(compare_distance);
}

/**
 * Return nearby party members ordered by HP ratio.
 *
 * @param {Criteria} [criteria] Criteria to filter entities by.
 * @returns {Array} Character objects.
 */
export function get_party_members(criteria) {
	criteria = criteria || {};

	return get_entities({...criteria, type: 'character', party: true}).sort(compare_hp);
}

/**
 * Return nearby entities.
 *
 * @param {Criteria} criteria Criteria to filter entities by.
 * @returns {Array} Character objects.
 */
export function get_entities(criteria) {
	return filter(Object.values(Adventure.get_entities()), criteria);
}

/**
 * Filter entities.
 *
 * @param {Array} entities Entities to filter.
 * @param {Criteria} criteria Criteria to filter entities by.
 */
export function filter(entities, criteria) {
	if (typeof entities === 'object') {
		entities = Object.values(entities);
	}

	return entities.filter((entity) => {
		if (criteria.name && entity.name !== criteria.name) {
			return false;
		}

		if (criteria.type && entity.type !== criteria.type) {
			return false;
		}

		if (criteria.ctype && entity.ctype !== criteria.ctype) {
			return false;
		}

		if (criteria.target && entity.target !== name(criteria.target)) {
			return false;
		}

		if (criteria.no_target && entity.target && entity.target.name !== character.name) {
			return false;
		}

		if (criteria.alive && (character.rip || character.dead)) {
			return false;
		}

		if (criteria.owner && entity.owner !== character.owner) {
			return false;
		}

		if (criteria.party && !(entity.name in Adventure.get_party())) {
			return false;
		}

		if (criteria.min_xp && entity.xp < criteria.min_xp) {
			return false;
		}

		if (criteria.path_check && !Adventure.can_move_to(entity)) {
			return false;
		}

		if (criteria.filter && !criteria.filter(entity)) {
			return false;
		}

		return true;
	});
}

/**
 * Get the name of an entity.
 *
 * @param {object|string} entity Entity object or entity name.
 */
export function name(entity) {
	return typeof entity === "object" ? entity.name : entity;
}

/**
 * Comparision function for ordering entities from nearest to furthest away.
 *
 * @param {object} a First entity to compare.
 * @param {object} b Second entity to compare.
 * @returns {number}
 */
export function compare_distance(a, b) {
	return distance_between(window.character, a) - distance_between(window.character, b);
}

/**
 * Comparision function for ordering entities by health ratio.
 *
 * @param {object} a First entity to compare.
 * @param {object} b Second entity to compare.
 * @returns {number}
 */
export function compare_hp(a, b) {
	return hp_ratio(a) - hp_ratio(b);
}

/**
 * Calculate the distance between two entities.
 *
 * @param {object} a The first entity.
 * @param {object} b The second entity.
 * @returns {number|null} Distance in pixels or null if not on the same map.
 */
export function distance_between(a, b) {
	if (a.map !== b.map) {
		return null;
	}

	return Util.distance(a.x, a.y, b.x, b.y);
}

/** Calculate time for target to move a certain distance
 *
 * @param {object} entity Target to measure.
 * @param {number} distance Distance target will move.
 * @returns {number} Duration in seconds.
*/
export function movement_time(entity, distance) {
	return distance / entity.speed;
}

/**
 * Calculate entity's HP ratio.
 *
 * @param {object} entity Entity to check.
 * @returns {number} Between 0.00 and 1.00;
 */
export function hp_ratio(entity) {
	return entity.hp / entity.max_hp;
}

/**
 * Calculate the difficulty of an entity.
 *
 * 0 is easy, 10 is impossibly hard.
 *
 * @param {object} entity Target to calculate difficulty of
 * @returns {number} Difficulty score out of 10.
 */
export function difficulty(entity) {
	const target_dps = Math.max(entity.attack * entity.frequency - 50, 0);
	const character_dps = character.attack * character.frequency;

	// How many seconds until someone would die?
	const t_target = entity.hp / character_dps;
	const t_character = character.hp / target_dps;
	const t_end = Math.min(t_target, t_character);

	const target_damage = Math.min(character_dps * t_end, entity.hp);
	const character_damage = Math.min(target_dps * t_end, character.hp);

	return 5 * (character_damage / character.hp) + 5 * (1 - (target_damage / entity.hp));
}

/**
 * Does it appear that two entities will collide?
 *
 * Note: This is based off the entities current velocity, so should that
 * change the actual result may be different.
 *
 * @see https://www.gamasutra.com/view/feature/131790/simple_intersection_tests_for_games.php?page=3
 *
 * @param {object} a First entity.
 * @param {object} b Second entity.
 * @param {number} [t_max] Max seconds to consider (default: forever).
 * @returns {boolean} True if they will collide, otherwise False.
 */
export function will_collide(a, b, t_max) {
	t_max = t_max || Infinity;

	const a_width = Adventure.get_width(a);
	const a_height = Adventure.get_height(a);
	const b_width = Adventure.get_width(b);
	const b_height = Adventure.get_height(b);

	// Bounding boxes
	const a_max = [a.x + a_width / 2, a.y + a_height / 2];
	const a_min = [a.x - a_width / 2, a.y - a_height / 2];
	const b_max = [b.x + b_width / 2, b.y + b_height / 2];
	const b_min = [b.x - b_width / 2, b.y - b_height / 2];

	// Solve from the reference frame of A (B in motion)
	// v = v_b - v_a
	const v = [b.vx - a.vx, b.vy - a.vy];

	// Iterate over axes and find start/end overlap times
	let u0 = [0, 0];
	let u1 = [0, 0];
	for (let i = 0; i < 2; i++) {
		if (a_max[i] < b_min[i] && v[i] < 0) {
			// A to the left|above of B and B approaching
			u0[i] = (a_max[i] - b_min[i]) / v[i];
		} else if (b_max[i] < a_min[i] && v[i] > 0) {
			// B to the left|above of A and B approaching
			u0[i] = (a_min[i] - b_max[i]) / v[i];
		}

		if (b_max[i] > a_min[i] && v[i] < 0) {
			// B to the right|below of A and B approaching
			u1[i] = (a_min[i] - b_max[i]) / v[i];
		} else if (a_max[i] > b_min[i] && v[i] > 0) {
			// A to the right|below of B and B approaching
			u1[i] = (a_max[i] - b_min[i]) / v[i];
		}
	}

	// Can only overlap if first overlap time is before the last overlap time
	const u0_max = Math.max(...u0);
	const u1_min = Math.min(...u1);
	return u0_max < u1_min && u0_max <= t_max + 0.250;  // Slight fudge
}

/**
 * Print the location of an entity.
 *
 * @param {object} entity An entity with a position.
 * @param {number} entity.x x-coordinate (pixels).
 * @param {number} entity.y y-coordinate (pixels).
 * @param {string} [entity.in] Optional instance/map.
 * @param {string} [entity.map] Optional map.
 */
export function location_to_string(entity) {
	let s = `${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`;
	if (entity.in && entity.in != entity.map) {
		s += ` in ${entity.in}`;
	} else if (entity.map) {
		s += ` on ${entity.map}`;
	}

	return s;
}
