# Adventure Land Coding Guide

## General hints

The offical docs can be found at <https://adventure.land/docs>, however these are often light on documentation and context.

It's highly recommended to look through [`runner.js`](https://github.com/kaansoral/adventureland/blob/master/runner_functions.js) on the [GitHub documentation](https://github.com/kaansoral/adventureland) as this is often an easier way to find out how to do a certain thing.

## Inventory

Many actions require interactive with your inventory. This is typically done using the index of `character.items[]`. Empty inventory slots will contain `null`.

```javascript
show_json(character.items)
[
	{
		"q": 152,
		"name": "hpot0",
		"gift": 1
	},
	{
		"q": 1,
		"name": "cscroll1"
	},
	{
		"name": "hpamulet",
		"level": 0
	},
	…
]
```

You can also determine the inventory index by inspecting your Inventory (Press `i`).

The Inventory starts at index `0` (top-left position) and moves left-to-right, top-to-bottom as follows:

|  |  |  |  |  |  |  |
|--|--|--|--|--|--|--|
| 0| 1| 2| 3| 4| 5| 6|
| 7| 8| 9|10|11|12|13|
|14|15|16|17|18|19|20|
|21|22|23|24|25|26|27|
|28|29|30|31|32|33|34|
|35|36|37|38|39|40|41|


## How do I...

### Attack

```javascript
attack(target)
attack(get_nearest_monster())  // Attack the nearest monster
```

**Note**: Target must be an entity object (from `parent.entities`), not a string.

### Move

```javascript
// Move directly to position (may be blocked by walls)
move(x, y)
move(0, 0)  // Move towards center of the map
move(character.x, character.y)  // Stop moving (move to current position)

// Move with pathfinding
smart_move(destination)
smart_move('exchange')  // Move to a named location
smart_move('winterland')  // Move to Winter map
smart_move('goo')  // Move to a random location with this monster type
smart_move({x: 0, y: 0, map: 'main'})  // Move to center of main map
```

`location` may be a well known location (`"upgrade"`, `"exchange"`, `"potions"`, `"scrolls"`), map (e.g `"winterland"`) or NPC name (e.g. `"lotterylady"`).

### Use a potion

```javascript
use_skill('use_hp')  // Use a HP potion
use_skill('use_mp')  // Use a MP potion
```

**Note:** These skills fall back to `"regen_hp"`/`"regen_mp"` if no potions are available.

### Use an item

```javascript
consume(inventory_index);
consume(0);  // Consume item in first inventory position (e.g. HP potion)
```

### Use a skill

```javascript
use_skill(name, target_or_name=null, extra_arg=null)
use_skill('regen_hp')  // Use Regenerate HP
```

### Equip an item

```javascript
equip(inventory_index, slot_index=null)
equip(2)  // Equip the item in the third slot (e.g. Amulet of HP)
```

### Transfer items

```javascript
send_item(character_name, inventory_index, quantity=1)
send_item('LigLarg', 0, 5)  // Give 5 of the first item to LigLarg
```

**Note:** You must be near the other character to send items.

### Upgrade an item

```javascript
upgrade(inventory_index, scroll_index, offering_index=null)
upgrade(2, 3)  // Upgrade the third item, using the fourth item (scroll)
```

### Compound an item

```javascript
compound(inventory_index1, index2, index3, scroll_index, offering_index=null)
compound(2, 3, 4, 5)  // Compound the third, fourth and fifth item, using the sixth item (cscroll)
```

### Use a door

```javascript
transport(map, spawn_index=0)
transport('bank', 0)  // Enter the bank from "main"
transport('main', 3)  // Exit the bank back to "main"
```

**Note:** You must be in range of the door to use it.

`spawn_index` is the index of `G.maps[dest_map].spawns[]` for the exit point of this door (or any other transport). However it is often easier to use `G.maps[origin_map].doors[i][5]` to find this index:

```javascript
{
	"doors": [
		[…, …, …, …, dest_map, spawn_index, …],
	]
}
```
