// ─────────────────────────────────────────────────────────────────────────────
// Server-side dice roll.
// Uses Node.js crypto.randomInt for cryptographically secure randomness.
// Dice values are NEVER computed on the client — this module is the only
// source of dice outcomes in the entire system.
// ─────────────────────────────────────────────────────────────────────────────

import { randomInt } from 'crypto';

/**
 * Roll a standard six-sided die.
 * Returns an integer in [1, 6] inclusive using cryptographic randomness.
 */
export function rollDice(): number {
  // randomInt(min, max) returns integer in [min, max)
  return randomInt(1, 7);
}
