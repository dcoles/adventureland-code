// Runner functions to be upstreamed.
// See: https://github.com/kaansoral/adventureland/blob/master/runner_functions.js

// PR: https://github.com/kaansoral/adventureland/pull/41

/**
 * Open Merchant stand.
 *
 * @param {number} [num=0] Inventory slot.
 */
function open_merchant(num)
{
	num = num || 0;
	if(!character.items[num]) return;
	if(G.items[character.items[num].name].type !== "stand") {
		parent.d_text("CAN'T OPEN", character);
		return;
	}
	parent.open_merchant(num);
}

/**
 * Close Merchant stand.
 */
function close_merchant()
{
	parent.close_merchant();
}


// PR: https://github.com/kaansoral/adventureland/pull/42

/**
 * Store an item in the Bank.
 *
 * `bank_store(0)` - Stores the first item in inventory in the first/best spot in bank.
 * `bank_store(0, "items0", 41)` - Stores the first item in inventory in the last spot in "items0".
 *
 * @param {number} inventory_slot Inventory slot number (0-41).
 * @param {string} [pack] Bank pack (one of "items0"-"items7").
 * @param {number} [pack_slot=-1] Pack slot number (0-41; default: first available).
 */
function bank_store(inventory_slot, pack, pack_slot)
{
	if(!character.bank) return game_log("Not inside the bank");
	if(!character.items[inventory_slot]) return game_log("No item in that spot");
	if(!(pack_slot >= 0)) pack_slot=-1; // the server interprets -1 as first slot available
	if(!pack)
	{
		var cp=undefined;
		for(var cpack in bank_packs)
		{
			if(pack || bank_packs[cpack][0]!=character.map || !character.bank[cpack]) continue;
			for(var i=0;i<character.bank[cpack].length;i++)
			{
				if(can_stack(character.bank[cpack][i],character.items[inventory_slot])) // the item we want to store and this bank item can stack - best case scenario
					pack=cpack;
				if(!character.bank[cpack][i] && !cp)
					cp=cpack;
			}
		}
		if(!pack && !cp) return game_log("Bank is full!");
		if(!pack) pack=cp;
	}

	// This call can be used manually to pull items, swap items and so on - str is from 0 to 41, it's the storage slot #
	parent.socket.emit("bank",{operation:"swap",pack:pack,str:pack_slot,inv:inventory_slot});
}

/**
 * Retrieve an item from the Bank.
 *
 * `bank_retrieve("items0", 0)` - Retrieves the first item in the "items0" bank pack.
 * `bank_retrieve("items0", 0, 41)` - Retrieves the first item in the "items0" bank pack and stores in the last inventory slot.
 *
 * @param {string} pack Bank pack (one of "items0"-"items7").
 * @param {number} pack_slot Bank pack slot number (0-41).
 * @param {number} [inventory_slot=-1] Inventory slot number (0-41; default: first available).
 */
function bank_retrieve(pack, pack_slot, inventory_slot)
{
	if(!character.bank) return game_log("Not inside the bank");
	if(!character.bank[pack] || !character.bank[pack][pack_slot]) return game_log("No item in that spot");
	if(!(inventory_slot>=0)) inventory_slot=-1; // the server interprets -1 as first slot available

	parent.socket.emit("bank",{operation:"swap",pack:pack,str:pack_slot,inv:inventory_slot});
}

/**
 * Try to move to position.
 *
 * @param {number} x x-coordinate.
 * @param {number} y y-coordinate.
 */
async function move(x, y) {
	// Workaround bug where move promise doesn't resolve on death
	const death = new Promise((resolve) => character.one('death', resolve));
	await Promise.race([parent.move(x, y, true), death]);  // race death itself!
}

/**
 * Override `smart_move` with `pathfind_move`.
 *
 * @param {object|string} dest
 */
async function smart_move(dest) {
	await Code.movement.pathfind_move(dest);
}
