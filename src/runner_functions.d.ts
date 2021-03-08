/**
 * This object proxies `parent.character`.
 */
declare var character: AdventureLand.Character;

declare var server: {
	/** Gameplay mode */
	mode: "normal" | "hardcore" | "test";
	/** true for PVP servers, use is_pvp() for maps */
	pvp: boolean;
	region: "EU" | "US" | "ASIA";
	id: "I" | "II" | "III" | "PVP" | "TEST";
}

declare var game: {
	/** "electron" for Steam, Mac clients, "web" for https://adventure.land */
	platform: "electron" | "web";
	/** if game.graphics is false, don't draw stuff to the game in your Code */
	graphics: boolean;
	/** if game.html is false, this character is loaded in [CODE] mode */
	html: boolean;
	cli: boolean;
};

/**
 * Start a character as a bot.
 *
 * @param name Name of character.
 * @param slot_or_name CODE slot.
 */
declare function start_character(name: string, slot_or_name: number | string);

/**
 * Stop running a character as a bot.
 *
 * @param name Name of character.
 */
declare function stop_character(name: string);

/**
 * Get the status of active characters.
 */
declare function get_active_characters(): Record<string, "self" | "starting" | "loading" | "active" | "code">;

/**
 * Use skill.
 *
 * @param name Skill name.
 * @param target Target of skill.
 * @param extra_arg Skill-specific argument.
 */
declare function use_skill(name: string, target?: AdventureLand.Entity, extra_arg?: any);

/**
 * Deposit gold in Bank.
 *
 * @param gold Amount of gold to depost.
 */
declare function bank_deposit(gold: number);

/**
 * Withdraw gold from Bank.
 *
 * @param gold Amount of gold to withdraw.
 */
function bank_withdraw(gold: number);

/**
 * Transport to new map.
 *
 * @param map Map name.
 * @param spawn Spawn point ID.
 */
declare function transport(map: string, spawn: number);

/**
 * Are the graphics currently paused?
 */
declare function is_paused(): boolean;

/**
 * Pauses the graphics.
 */
declare function pause();

/**
 * Get `Socket.IO` socket for character.
 */
declare function get_socket(): any;

/**
 * Get the current map.
 */
function get_map(): any;

/**
 * Set status message.
 *
 * @param text HTML text.
 * @param color Text color.
 */
declare function set_message(text: string, color?: string);

/**
 * Write message to game log.
 *
 * @param message Message text.
 * @param color CSS color.
 * @param x ???
 */
declare function game_log(message: string, color?: string = "#51D2E1", x?: boolean);

/**
 * Write message to game log.
 *
 * @param message Message HTML.
 * @param color CSS color.
 */
declare function log(message: string, color?: string);

/**
 * Write message to game log, escaping any HTML values.
 *
 * @param message Message text.
 * @param color CSS color.
 */
declare function safe_log(message: string, color?: string);

/**
 * Get the current target.
 */
declare function get_target(): AdventureLand.Entity | null;

/**
 * Get the current target, if they're a monster.
 */
 declare function get_targeted_monster(): AdventureLand.Monster | null;

/**
 * Change character's active target.
 *
 * @param target New target.
 */
declare function change_target(target: AdventureLand.Entity);

/**
 * Is it possible to move directly to a position?
 *
 * @param x Entity or x-coordinate
 * @param y y-coordinate (if Entity not provided).
 */
declare function can_move_to(x: AdventureLand.Entity | number, y?: number): boolean;

/**
 * Try to move directly to location, otherwise fallback to `smart_move`.
 *
 * @param x x-coordinate.
 * @param y y-coordinate.
 */
declare function xmove(x: number, y: number): Promise<AdventureLand.Reason>

/**
 * Is `target` in range of this skill?
 *
 * @param target Target of skill.
 * @param skill Skill name.
 */
declare function is_in_range(target: object, skill: string): boolean;

/**
 * Is this skill on cooldown?
 *
 * @param skill Skill name.
 */
declare function is_on_cooldown(skill: string): boolean;

/**
 * Is it possible to attack this target?
 *
 * @param target Target entity.
 */
declare function can_attack(target: AdventureLand.Entity): boolean;

/**
 * Is it possible to heal this target?
 *
 * @param target Target entity.
 */
declare function can_heal(target: AdventureLand.Entity): boolean;

/**
 * Is this entity currently moving?
 *
 * @param entity Entity.
 */
declare function is_moving(entity: AdventureLand.Entity): boolean;

/**
 * Is this entity currently in the process of transporting.
 *
 * @param entity Entity.
 */
declare function is_transporting(entity: AdventureLand.Entity): boolean;

/**
 * Attack target.
 *
 * @param target Target to attack.
 */
declare function attack(target?: AdventureLand.Entity);

/**
 * Heal target.
 *
 * @param target Target to heal.
 */
declare function heal(target?: AdventureLand.Entity);

/**
 * Buy an item.
 *
 * @param name Item name.
 * @param quantity Quantity of item to purchase.
 */
declare function buy(name: string, quantity?: number): Promise;

/**
 * Buy an item with gold.
 *
 * @param name Item name.
 * @param quantity Quantity of item to purchase.
 */
declare function buy_with_gold(name: string, quantity?: number): Promise;

/**
 * Buy an item with shells.
 *
 * @param name Item name.
 * @param quantity Quantity of item to purchase.
 */
declare function buy_with_shells(name: string, quantity?: number);

/**
 * Sell an item.
 *
 * @param num Inventory slot number.
 * @param quantity Quantity of item to sell.
 */
declare function sell(num: string, quantity?: number);

/**
 * Upgrade an item.
 *
 * @param item_num Inventory slot number of item.
 * @param scroll_num Inventory slot number of upgrade scroll.
 * @param offering_num Inventory slot number of offering.
 */
declare function upgrade(item_num: number, scroll_num: number, offering_num?: number): Promise;

/**
 * Compound 3 items.
 *
 * @param item0 Inventory slot number of first item.
 * @param item1 Inventory slot number of second item.
 * @param item2 Inventory slot number of third item.
 * @param scroll_num Inventory slot number of compound scroll.
 * @param offering_num Inventory slot number of offering.
 */
declare function compound(item0: number, item1: number, item2: number, scroll_num: number, offering_num?: number): Promise;

/**
 * Exchange item.
 *
 * @param item_num Inventory slot number of item.
 */
declare function exchange(item_num: number);

/**
 * Attempt to move to move directly to coordinates.
 *
 * @param x x-coordinate.
 * @param y y-coordinate.
 */
declare function move(x: number, y: number): Promise<AdventureLand.Reason>;

/**
 * Get details about all of our characters.
 *
 * @returns {Array} Array of character details.
 */
declare function get_characters(): AdventureLand.CharacterInfo[];

/**
 * Get your party members.
 *
 * Updated infrequently.
 */
declare function get_party(): object;

/**
 * Get entity by ID.
 *
 * @param id Entity ID.
 * @returns Entity object.
 */
declare function get_entity(id: string): AdventureLand.Entity;

/**
 * Find location of NPC
 *
 * @param npc_id NPC ID.
 */
declare function find_npc(npc_id: string): AdventureLand.MapLocation | null;

/**
 * Loot chest.
 *
 * @param id Loot specific chest.
 */
declare function loot(id?: string | boolean);

/**
 * Get nearby chests.
 */
declare function get_chests(): Record<string, any>;

/**
 * Open merchant stand.
 *
 * @param num Open merchant stand from specific inventory slot.
 */
declare function open_stand(num?: number);

/**
 * Close merchant stand.
 */
declare function close_stand();

/**
 * Send gold to character.
 *
 * @param receiver Receiver of gold.
 * @param gold Amount of gold to send.
 */
declare function send_gold(receiver: AdventureLand.Character | string, gold: number);

/**
 * Send item to character.
 *
 * @param receiver Receiver of item.
 * @param num Inventory slot number of item.
 * @param quantity Quantity to send.
 */
declare function send_item(receiver: AdventureLand.Character | string, num: number, quantity?: number = 1);

/**
 * Send party invite.
 *
 * @param name Name of the character to invite.
 */
declare function send_party_invite(name: string);

/**
 * Send party request.
 *
 * @param name Name of the character to request to party with.
 */
declare function send_party_request(name: string);

/**
 * Accept party invite.
 *
 * @param name Name of the character who sent the invitation.
 */
declare function accept_party_invite(name: string);

/**
 * Accept party request.
 *
 * @param name Name of the character who sent the request.
 */
declare function accept_party_request(name: string);

/**
 * Leave current party.
 */
declare function leave_party();

/**
 * Kick character from party.
 *
 * @param name Character name.
 */
declare function kick_party_member(name: string);

/**
 * Respawn character.
 */
declare function respawn();

declare function on_disappear(entity: AdventureLand.Entity, data: object);

/**
 * Called when invited to party.
 *
 * @param name Inviter's character name.
 */
declare function on_party_invite(name: string);

/**
 * Called when someone requests to join your existing party.
 *
 * @param name Requester's character name.
 */
declare function on_party_request(name: string);

/**
 * Called by the mage's name in PVE servers, in PVP servers magiport either succeeds or fails without consent.
 *
 * Call `accept_magiport(name)` to accept.
 *
 * @param name Mage's character name.
 */
declare function on_magiport(name: string);

/**
 * Called when the map is clicked.
 *
 * @param x x-coordinate.
 * @param y y-coordinate.
 * @returns Whether the default move action should be cancelled.
 */
declare function on_map_click(x: number, y: number): boolean;

/**
 * Called just before the CODE is destroyed.
 */
declare function on_destroy();

/**
 * Called at the best place in each game draw frame,
 * so if you are playing the game at 60fps, this function gets called 60 times per second.
 */
declare function on_draw();

/**
 * Draw line.
 *
 * @param x Starting x-coordinate.
 * @param y Starting y-coordinate.
 * @param x2 Ending x-coordinate.
 * @param y2 Ending y-coordinate.
 * @param size Line width.
 * @param color: Line color.
 * @returns `PIXI.Graphics` object.
 */
declare function draw_line(x: number, y: number, x2: number, y2: number, size?: number = 1, color?: number = 0xF38D00): object;

/**
 * Draw circle.
 *
 * @param x Starting x-coordinate.
 * @param y Starting y-coordinate.
 * @param radius Circle radius.
 * @param size Line width.
 * @param color: Line color.
 * @returns `PIXI.Graphics` object.
 */
declare function draw_circle(x: number, y: number, radius: number, size?: number = 1, color?: number = 0x00F33E): object;

/**
 * Clear all buttons.
 */
declare function clear_buttons();

/**
 * Clear all drawings.
 */
declare function clear_drawings();

/**
 * Map a key to a skill.
 *
 * @param key Key to map to.
 * @param skill Skill to set.
 * @param code Optional code for skill.
 */
declare function map_key(key: string, skill: string, code?: string);

/**
 * Store value in persistant storage.
 *
 * Object must be JSON serializable.
 *
 * @param name Key to identify value.
 */
declare function set(name: string, value: any);

/**
 * Fetch value from persistant storage.
 *
 * @param name Key to identify value.
 */
declare function get(name: string): any;

/**
 * Move to a location using path-finding.
 *
 * @param location Location to move to.
 */
function smart_move(location: AdventureLand.MapLocation | string): Promise<AdventureLand.Reason>;

/**
 * Cancels channeling abilities or active skills.
 *
 * @param action Action to cancel.
 * @param second ???
 */
declare function stop(action: string = "move", second?: boolean);

/**
 * Get the width of an entity.
 *
 * Note: This function is not in the docs, but used by other
 * documented functions like `distance`.
 *
 * @param entity An entity with dimensions.
 * @returns Width in pixels.
 */
declare function get_width(entity: AdventureLand.Entity): number;

/**
 * Get the height of an entity.
 *
 * Note: This function is not in the docs, but used by other
 * documented functions like `distance`.
 *
 * @param entity An entity with dimensions.
 * @returns Height in pixels
 */
declare function get_height(entity: AdventureLand.Entity): number;
