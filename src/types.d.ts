// Types for Adventure Land
// Mostly used to allow better @ts-check checking

namespace Adventure {
	/**
	 * A box of `width`x`height` centered at `x`,`y`.
	 */
	interface Box {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	export interface Entity {
		name: string;
		type: string;
		hp: number;
		max_hp: number;
	}
}
