// Types for Adventure Land built-ins

/**
 * An Item object, such as found in inventory or bank.
 *
 * @param name Item ID (e.g. `"hpamulet"`).
 * @param level Item level.
 * @param q Stackable quantity.
 * @param gift 1 if this was a gift?.
 */
interface Item {
	name: string;
	level?: number;
	q?: number;
	gift?: number;
}

/**
 * A Monster.
 *
 * @see https://adventure.land/docs/code/monster/reference.
 */
interface Monster {
	name: string;
	type: "monster";
	mtype: string;
	skin: string;
	hp: number;
	max_hp: number;
	mp: number;
	speed: number;
	xp: number;
	attack: number;
	level: number;
	frequency: number;
	aggro: number;
	rage: number;
	damage_type: "physical" | "magical";
	respawn: number;
	difficulty: number;
	range: number;
	id: number;
	map: string;
	in: string;
	s: Status;
	target: string;
	moving: boolean;
	visible: boolean;
	dead: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	armor?: number;
	resistance?: number;
	dreturn?: number;
	lifesteal?: number;
	evasion?: number;
	reflection?: number;
	cooperative?: boolean;
	immune?: boolean;
	"1hp"?: boolean;
	spawns?: [number, string];
	abilities?: Object;
	vx?: number;
	vy?: number;
	from_x?: number;
	from_y?: number;
	going_x?: number;
	going_y?: number;
}

/**
 * Entity status.
 */
interface Status {
	stunned?: boolean;
	cursed: StatusDuration;
}

/**
 * Duration of Status.
 */
interface StatusDuration {
	ms: number;
}

/**
 * A Location.
 *
 * @param x Map x-coordinate.
 * @param y Map y-coordinate.
 * @param map Map name.
 */
interface MapLocation {
	x?: number;
	y?: number;
	map?: string;
}
