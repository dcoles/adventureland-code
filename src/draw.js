// Drawing functions
// @ts-check

/** Drawing lists. */
const g_lists = {};

/**
 * Track a drawing entity on a global list.
 *
 * @param {string} name List name.
 * @param {PIXI.Sprite} entity Entity to add.
 */
export function add_list(name, entity) {
	if (!(name in g_lists)) {
		g_lists[name] = [];
	}

	g_lists[name].push(entity);
}

/**
 * Destroy all drawing entities in a list.
 *
 * @param {string} name List name.
 */
export function clear_list(name) {
	const list = g_lists[name];
	if (!list) {
		return;
	}

	for (let entity of list) {
		destroy(entity);
	}

	delete g_lists[name];
}

/**
 * Destroy an drawing entity.
 *
 * @param {PIXI.Sprite} entity Entity to destroy.
 */
export function destroy(entity) {
	if (!entity) {
		return;
	}

	const i = parent.drawings.findIndex((e) => e === entity);
	if (i != -1) {
		parent.drawings.splice(i, 1);
	}

	if (entity._destroyed) {
		return;
	}

	entity.destroy({children: true});
}
