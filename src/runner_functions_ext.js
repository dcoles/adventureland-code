// Runner functions to be upstreamed.
// See: https://github.com/kaansoral/adventureland/blob/master/runner_functions.js

/**
 * Swap slots between bank and inventory.
 *
 * @param {string} pack Bank pack (one of "items0"-"items7").
 * @param {number} pack_slot Bank pack slot number (0-41).
 * @param {number} inventory_slot Inventory slot number (0-41).
 */
function bank_swap(pack, pack_slot, inventory_slot) {
	if(!character.bank) return game_log("Not inside the bank");

	// This call can be used manually to pull items, swap items and so on - str is from 0 to 41, it's the storage slot #
	parent.socket.emit("bank",{operation:"swap",pack:pack,str:pack_slot,inv:inventory_slot});
}

/**
 * Move an item inside the Bank.
 *
 * @param {string} pack Bank pack (one of "items0"-"items7")
 * @param {number} slot1 Slot of the first item (0-41).
 * @param {number} slot2 Slot of the second item (0-41).
 */
function bank_move(pack, slot1, slot2) {
	if(!character.bank) return game_log("Not inside the bank");

	parent.socket.emit("bank", {operation: "move", a: slot1, b: slot2, pack: pack})
}


/**
 * Override `smart_move` with `pathfind_move`.
 *
 * @param {object|string} dest
 */
async function smart_move(dest) {
	await Code.movement.pathfind_move(dest);
}
