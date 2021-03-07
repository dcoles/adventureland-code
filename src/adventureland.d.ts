// Types for Adventure Land built-ins
declare namespace AdventureLand {
	/**
	 * A Character.
	 */
	interface Character {
		name: string;
		type: "character";
		/** One of `G.classes` */
		ctype: string;
		hp: number;
		max_hp: number;
		mp: number;
		max_mp: number;
		level: number;
		/** Your current XP */
		xp: number;
		/** `max_xp` is `G.levels[character.level]` */
		max_xp: number;
		str: number;
		int: number;
		dex: number;
		vit: number;
		/** 10 Fortitude, 10% PVP Damage Reduction */
		for: number;
		attack: number;
		/** attacks/second */
		frequency: number;
		/** run speed, pixels/second */
		speed: number;
		/** attack range in pixels */
		range: number;
		/** extra range allowance - increases 5/second - max 25 */
		xrange: number;
		armor: number;
		resistance: number;
		mp_cost: number;
		/** percentage (0-100) */
		evasion: number;
		/** % of attacks you miss */
		miss: number;
		/** magical attack reflection */
		reflection: number;
		/** percentage (0-100) */
		lifesteal: number;
		/** percentage (0-100) */
		manasteal: number;
		/** resistance piercing */
		rpiercing: number;
		/** armor piercing */
		apiercing: number;
		/** % chance to hit 2X */
		crit: number;
		/** damage return */
		dreturn: number;
		/** max amount of physical targets before getting scared */
		courage: number;
		/** max amount of magical targets before getting scared */
		mcourage: number;
		/** max amount of pure targets before getting scared */
		pcourage: number;
		/** courage excess */
		fear: number;
		/** percentage (0.0-1.0) */
		tax: number;
		gold: number;
		/** shells */
		cash: number;
		/** XP multiplier */
		xpm: number;
		/** Luck multiplier */
		luckm: number;
		/** Gold multiplier (1.25 = +25%) */
		goldm: number;
		/** Number of monsters who target you */
		targets: number;
		/** If true, you are dead */
		rip: boolean;
		/** When you move your mouse, becomes true */
		afk: boolean;
		/** Indicates whether a character is visible or not */
		visible: boolean;
		/** true when a character is running Code */
		code: boolean;
		/** true for moving NPC's */
		citizen: boolean;
		/** average round-trip between character and server in milliseconds */
		ping: number;
		/**Call Code Cost */
		cc: number;
		moving: boolean;
		/** ID of the monster you are targeting or the name of the character you are targeting */
		target: string;
		/** Secondary, manual focus/target */
		focus: string;
		/** Which instance your character is in; If you are in a dungeon, it's a unique ID, otherwise it's the map you are in */
		in: string;
		/** The map your character is in */
		map: string;
		x: number;
		y: number;
		vision: [number, number];
		/** Owner ID - Available If a character isn't private, "" otherwise */
		owner: string;
		/** Set for your character */
		me: number;
		guild: string;
		/** Merchant stand type */
		stand: boolean;
		/** age in days */
		age: number;
		/** Your base skin */
		skin: string;
		/** Cosmetics */
		cx: Array<string>;
		slots: object;
		/** Inventory size */
		isize: number;
		/** Empty slots */
		esize: number;
		items: Array<Item | null>;
		/** Party leader name */
		party: string;
		/** Approximated dps used for the party share % */
		pdps: number
		s: Status;
		/** Channeling actions */
		c: object;
		/** Progressed actions */
		q: object;
		/** Owner ID's of your friends */
		friends: Array<string>;
		/** Speed on the X-axis */
		vx?: number;
		/** Speed on the Y-axis */
		vy?: number;
		from_x?: number;
		from_y?: number;
		going_x?: number;
		going_y?: number;
	}

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
	 * Reason.
	 */
	interface Reason {
		reason: string;
	}

	/**
	 * Entity status.
	 */
	interface Status {
		stunned?: boolean;
		cursed?: StatusDuration;
		mluck?: StatusDuration;
		invis?: boolean;
		invincible?: boolean;
		poisoned?: boolean;
		poisonous?: boolean;
	}

	/**
	 * Duration of Status.
	 */
	interface StatusDuration {
		/** `ms` is milliseconds left */
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

}
