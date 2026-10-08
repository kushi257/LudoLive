// ─────────────────────────────────────────────────────────────────────────────
// Capture detection logic.
// A capture occurs when a token lands on a main-track square (boardIndex 0–51)
// that is already occupied by one or more opponent tokens, AND that square
// is not a safe square.
// Captured tokens are returned to HOME zone.
// ─────────────────────────────────────────────────────────────────────────────

import { RoomState, PlayerState, TokenId, PlayerId, TokenState } from './types';
import { isSafeSquare, normalizedToPhysical } from './boardLayout';

export interface CaptureResult {
  capturedTokens: Array<{
    ownerId: PlayerId;
    tokenId: TokenId;
  }>;
}

/**
 * After a token has moved to newNormalizedIndex on the main track,
 * check whether it captures any opponent tokens at the same physical square.
 *
 * Returns a list of (ownerId, tokenId) pairs that were captured.
 * The caller is responsible for updating those tokens' positions to HOME.
 */
export function checkCapture(
  state: RoomState,
  movingPlayerId: PlayerId,
  movingPlayerColor: string,
  newNormalizedIndex: number
): CaptureResult {
  // Only main-track squares can have captures
  if (newNormalizedIndex >= 52) {
    return { capturedTokens: [] };
  }

  // Safe squares cannot be the site of a capture
  if (isSafeSquare(newNormalizedIndex)) {
    return { capturedTokens: [] };
  }

  // Physical square of the landing position
  const landingPhysical = normalizedToPhysical(movingPlayerColor as any, newNormalizedIndex);

  const captured: CaptureResult['capturedTokens'] = [];

  for (const player of state.players) {
    // Can't capture your own tokens
    if (player.playerId === movingPlayerId) continue;
    // Forfeited players' tokens remain but can't be captured (board is frozen)
    if (player.status === 'FORFEITED') continue;

    for (const token of player.tokens) {
      if (token.position.zone !== 'BOARD') continue;

      const tokenPhysical = normalizedToPhysical(player.color, token.position.boardIndex as number);

      if (tokenPhysical === landingPhysical) {
        // Additional safety: a token in the home column (52–56) cannot be captured
        // even if normalizedToPhysical returned the same value by coincidence
        if ((token.position as any).boardIndex >= 52) continue;

        captured.push({ ownerId: player.playerId, tokenId: token.tokenId });
      }
    }
  }

  return { capturedTokens: captured };
}

/**
 * Apply capture results to the state: send captured tokens back to HOME.
 * Returns a new RoomState (immutable update).
 */
export function applyCaptures(state: RoomState, captures: CaptureResult): RoomState {
  if (captures.capturedTokens.length === 0) return state;

  const newPlayers = state.players.map((player): PlayerState => {
    const capturedIds = captures.capturedTokens
      .filter(c => c.ownerId === player.playerId)
      .map(c => c.tokenId);

    if (capturedIds.length === 0) return player;

    const newTokens = player.tokens.map((token): TokenState => {
      if (capturedIds.includes(token.tokenId)) {
        return { ...token, position: { zone: 'HOME' } };
      }
      return token;
    });

    return { ...player, tokens: newTokens as [TokenState, TokenState, TokenState, TokenState] };
  });

  return { ...state, players: newPlayers };
}
