// ─────────────────────────────────────────────────────────────────────────────
// Win condition check.
// A player wins when all 4 of their tokens are in the FINISHED zone.
// The game ends immediately when the first player achieves this.
// ─────────────────────────────────────────────────────────────────────────────

import { RoomState, PlayerId } from './types';

/**
 * Check if any player has won (all 4 tokens FINISHED).
 * Returns the winning PlayerId or null if no winner yet.
 */
export function checkWin(state: RoomState): PlayerId | null {
  if (state.phase !== 'IN_PROGRESS') return null;
  for (const player of state.players) {
    if (player.status === 'FORFEITED') continue;
    const allFinished = player.tokens.every(t => t.position.zone === 'FINISHED');
    if (allFinished) {
      return player.playerId;
    }
  }
  return null;
}

/**
 * Check if only one non-forfeited player remains (win by elimination).
 * Returns that player's PlayerId or null.
 */
export function checkWinByElimination(state: RoomState): PlayerId | null {
  if (state.phase !== 'IN_PROGRESS') return null;
  if (state.players.length < 2) return null;
  const activePlayers = state.players.filter(
    p => p.status !== 'FORFEITED' && p.status !== 'FINISHED'
  );
  if (activePlayers.length === 1) {
    return activePlayers[0].playerId;
  }
  return null;
}

