// Functions for working with entities.
// @ts-check

import * as AABB from '/aabb.js';
import * as Adventure from '/adventure.js';
import * as Util from '/util.js';

/**
 * Filter criteria.
 *
 * @typedef {object} Criteria
 * @property {string} [name] Entity must have this name.
 * @property {"character"|"monster"} [type] Entity must match this type.
 * @property {string} [ctype] Entity must be of this class type.
 * @property {boolean} [npc] Entity must be an NPC.
 * @property {object|string} [target] Entity must be targetting this entity.
 * @property {boolean} [no_target] Entity must not have a target.
 * @property {boolean} [alive] If true, entity must be alive.
 * @property {boolean} [owner] If true, entity must be owned by us.
 * @property {boolean} [party] If true, entity must be in our party.
 * @property {number} [min_xp] Entity must give at least this much XP.
 * @property {number} [max_distance] Entity must be no further than this distance.
 * @property {boolean} [path_check] Entity must be directly reachable.
 * @property {Function} [filter] General-purpose filter function.
 */

/**
 * Return nearest monsters.
 *
 * @param {Criteria} [criteria] Criteria for matching monster.
 * @returns {AdventureLand.Monster[]} Monsters ordered from nearest to furthest away.
 */
export function get_nearby_monsters(criteria) {
	criteria = criteria || {};
	return get_entities({...criteria, type: 'monster', min_xp: 1}).sort(compare_distance);
}

/**
 * Return nearby party members ordered by HP ratio.
 *
 * @param {Criteria} [criteria] Criteria to filter entities by.
 * @returns {AdventureLand.Character[]} Character objects.
 */
export function get_party_members(criteria) {
	criteria = criteria || {};

	return get_entities({...criteria, type: 'character', party: true}).sort(compare_hp);
}

/**
 * Return nearby entities.
 *
 * @param {Criteria} criteria Criteria to filter entities by.
 * @param {boolean} [include_self=false] Should our character be included?
 * @returns {Array} Character objects.
 */
export function get_entities(criteria, include_self) {
	const entities = Object.values(Adventure.get_entities());
	if (include_self) {
		entities.push(window.character);
	}

	return filter(entities, criteria);
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

		if (Util.is_boolean(criteria.npc) && (entity.npc ?? false) !== criteria.npc) {
			return false;
		}

		if (criteria.target && entity.target !== name(criteria.target)) {
			return false;
		}

		if (criteria.no_target && entity.target && entity.target.name !== character.name) {
			return false;
		}

		if (Util.is_boolean(criteria.alive) && is_dead(entity) === criteria.alive) {
			return false;
		}

		if (criteria.owner && entity.owner !== character.owner) {
			return false;
		}

		if (Util.is_boolean(criteria.party) && entity.name in window.get_party() !== criteria.party) {
			return false;
		}

		if (criteria.min_xp && entity.xp < criteria.min_xp) {
			return false;
		}

		if (Util.is_number(criteria.max_distance) && distance_between(character, entity) > criteria.max_distance) {
			return false;
		}

		if (criteria.path_check && !window.can_move_to(entity)) {
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
 * Is this entity dead?
 *
 * @param {object} entity Character or Monster.
 */
export function is_dead(entity) {
	return entity.rip ?? entity.dead;
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
 * @param {object} a First entity.
 * @param {object} b Second entity.
 * @param {number} [t_max] Max seconds to consider (default: forever).
 * @returns {boolean} True if they will collide, otherwise False.
 */
export function will_collide(a, b, t_max) {
	t_max = t_max || Infinity;

	return AABB.intersect_moving(aabb(a), aabb(b), [a.vx, a.vy], [b.vx, b.vy], t_max) !== null;
}

/**
 * Return Axis-Aligned Bounding Box (min-max) for an entity.
 *
 * @param {AdventureLand.Entity} entity Entity
 * @returns {[[number, number], [number, number]]} [min, max] AABB
 */
export function aabb(entity) {
	const width = window.get_width(entity);
	const height = window.get_height(entity);

	const min = [entity.x - width / 2, entity.y - height / 2];
	const max = [entity.x + width / 2, entity.y + height / 2];

	return [min, max];
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
