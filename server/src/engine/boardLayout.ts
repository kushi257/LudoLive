// ─────────────────────────────────────────────────────────────────────────────
// Board layout: color-normalized position system
//
// Each color's main track starts at index 0 (their own starting square) and
// wraps clockwise for 52 squares (indices 0–51). The color's home column
// is indices 52–56 (5 steps, only reachable by that color). Index 57 means
// finished (but we use the FINISHED zone instead for clarity).
//
// Physical board layout (standard Ludo, 15×15 grid):
//   Slot 0 = RED    starts at physical square 1   (top-left arm)
//   Slot 1 = GREEN  starts at physical square 14  (top-right arm, 13 ahead)
//   Slot 2 = YELLOW starts at physical square 27  (bottom-right arm, 26 ahead)
//   Slot 3 = BLUE   starts at physical square 40  (bottom-left arm, 39 ahead)
//
// The main track has 52 squares total. Each color's safe squares are at the
// same normalized offsets.
// ─────────────────────────────────────────────────────────────────────────────

import { Color } from './types';

// Number of squares on the main loop
export const MAIN_TRACK_LENGTH = 52;

// Home column length (indices 52–56 from each color's perspective)
export const HOME_COLUMN_LENGTH = 5;
export const HOME_COLUMN_START = 52;
export const HOME_COLUMN_END = 56;   // inclusive

// A token at index FINISHED_INDEX is done (but we use zone:'FINISHED' instead)
export const FINISHED_INDEX = 57;

// ── Safe Squares (color-normalized) ──────────────────────────────────────
// These offsets are the same for all colors (color-normalized means offset 0
// is always "your starting square"). Tokens on safe squares cannot be captured.
// Standard Ludo safe squares: start, and 7 others.
export const SAFE_SQUARES = new Set<number>([
  0,   // Each color's own starting square
  8,   // Safe square on main track
  13,  // Opponent's start (safe for them)
  21,
  26,
  34,
  39,
  47,
  // Home column (52–56) is implicitly safe — no captures there
]);

export function isSafeSquare(boardIndex: number): boolean {
  return boardIndex >= HOME_COLUMN_START || SAFE_SQUARES.has(boardIndex);
}

// ── Color ordering ────────────────────────────────────────────────────────
export const COLORS: Color[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

// Physical start squares on the main track (0-indexed, 0–51)
// Each color's start is 13 squares apart
const COLOR_PHYSICAL_START: Record<Color, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
};

/**
 * Convert a normalized board index (relative to a specific color's start)
 * to the global physical track index (0–51).
 * Only applies to main track (boardIndex 0–51).
 */
export function normalizedToPhysical(color: Color, normalizedIndex: number): number {
  if (normalizedIndex >= HOME_COLUMN_START) {
    // Home column — physical position is color-specific; no cross-color comparison needed
    return normalizedIndex;
  }
  return (COLOR_PHYSICAL_START[color] + normalizedIndex) % MAIN_TRACK_LENGTH;
}

/**
 * Convert a physical track index (0–51) to a normalized index for a given color.
 * Only applies to main track; home column squares cannot be converted.
 */
export function physicalToNormalized(color: Color, physicalIndex: number): number {
  const start = COLOR_PHYSICAL_START[color];
  return (physicalIndex - start + MAIN_TRACK_LENGTH) % MAIN_TRACK_LENGTH;
}

/**
 * Returns the normalized index at which a player's home column begins.
 * A token must be at exactly normalized index 51 to enter the home column.
 * (i.e., it passes square 51 and enters 52 on its next move)
 */
export function homeColumnEntry(color: Color): number {
  // The entry to the home column is one step before completing the full loop.
  // In our normalized scheme, index 51 is the last main-track square before
  // the home column. A token on square 51 with the right dice value enters
  // home column at index 52 + (diceValue - 1).
  void color; // same for all colors in normalized coordinates
  return 51;
}

/**
 * Get the color assigned to a given slot number.
 */
export function slotToColor(slot: number): Color {
  return COLORS[slot % 4];
}
