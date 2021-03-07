/**
 * This object proxies `parent.character`.
 */
declare var character: AdventureLand.Character;

/**
 * Attempt to move to coordinates.
 *
 * @param x x-coordinate.
 * @param y y-coordinate.
 */
declare function move(x: number, y: number): Promise<AdventureLand.Reason>;
