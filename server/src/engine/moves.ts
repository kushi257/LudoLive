// ─────────────────────────────────────────────────────────────────────────────
// Valid move calculation and move application.
// All logic is pure (no networking, no side effects).
// ─────────────────────────────────────────────────────────────────────────────

import {
  RoomState,
  PlayerState,
  TokenState,
  ValidMove,
  TokenId,
  PlayerId,
} from './types';
import {
  MAIN_TRACK_LENGTH,
  HOME_COLUMN_START,
  HOME_COLUMN_END,
  isSafeSquare,
} from './boardLayout';
import { checkCapture, applyCaptures } from './capture';

// ── Valid Move Calculation ─────────────────────────────────────────────────

/**
 * Calculate all valid moves for the current player given a dice value.
 * Returns an empty array if no moves are possible (player must pass).
 */
export function calculateValidMoves(state: RoomState, diceValue: number): ValidMove[] {
  const turn = state.turn;
  if (!turn) return [];

  const player = state.players[turn.currentPlayerSlot];
  if (!player) return [];

  const moves: ValidMove[] = [];

  for (const token of player.tokens) {
    const move = calculateTokenMove(state, player, token, diceValue);
    if (move) moves.push(move);
  }

  return moves;
}

/**
 * Calculate the move for a single token given the dice value.
 * Returns null if this token cannot move.
 */
function calculateTokenMove(
  state: RoomState,
  player: PlayerState,
  token: TokenState,
  diceValue: number
): ValidMove | null {
  const { position } = token;

  // ── HOME zone: can only exit on a 6 ────────────────────────────────────
  if (position.zone === 'HOME') {
    if (diceValue !== 6) return null;
    // Token enters main track at normalized index 0
    const captures = checkCapture(state, player.playerId, player.color, 0);
    return {
      tokenId: token.tokenId,
      fromZone: 'HOME',
      toZone: 'BOARD',
      toIndex: 0,
      captures: captures.capturedTokens.length > 0,
    };
  }

  // ── FINISHED zone: cannot move ─────────────────────────────────────────
  if (position.zone === 'FINISHED') return null;

  // ── BOARD zone ─────────────────────────────────────────────────────────
  const currentIndex = (position as { zone: 'BOARD'; boardIndex: number }).boardIndex;
  const newIndex = currentIndex + diceValue;

  // Cannot overshoot the end (must land exactly on 56 or enter home column precisely)
  if (newIndex > HOME_COLUMN_END + 1) {
    // +1 because landing on 57 means FINISHED; we allow exact landing
    return null;
  }

  // Landing exactly beyond HOME_COLUMN_END means FINISHED
  if (newIndex > HOME_COLUMN_END) {
    // newIndex === 57 exactly
    return {
      tokenId: token.tokenId,
      fromZone: 'BOARD',
      toZone: 'FINISHED',
      toIndex: null,
      captures: false,
    };
  }

  // Landing in home column (52–56): no captures possible
  if (newIndex >= HOME_COLUMN_START) {
    return {
      tokenId: token.tokenId,
      fromZone: 'BOARD',
      toZone: 'BOARD',
      toIndex: newIndex,
      captures: false,
    };
  }

  // Landing on main track (0–51): check for captures
  // Wrap around the main track
  const wrappedIndex = newIndex % MAIN_TRACK_LENGTH;
  const captures = checkCapture(state, player.playerId, player.color, wrappedIndex);

  return {
    tokenId: token.tokenId,
    fromZone: 'BOARD',
    toZone: 'BOARD',
    toIndex: wrappedIndex,
    captures: captures.capturedTokens.length > 0,
  };
}

// ── Move Application ───────────────────────────────────────────────────────

/**
 * Apply a move to the game state.
 * Validates the move is still legal, applies it, handles captures,
 * and returns the updated RoomState.
 * Throws an error string (ErrorCode) if the move is invalid.
 */
export function applyMove(
  state: RoomState,
  playerId: PlayerId,
  tokenId: TokenId
): RoomState {
  const turn = state.turn;
  if (!turn) throw 'INVALID_PHASE';
  if (turn.phase !== 'AWAITING_MOVE') throw 'INVALID_PHASE';
  if (turn.diceValue === null) throw 'INVALID_PHASE';

  const player = state.players[turn.currentPlayerSlot];
  if (!player || player.playerId !== playerId) throw 'NOT_YOUR_TURN';

  // Re-compute valid moves (server is authoritative — client precomputed list
  // is UX only and cannot be trusted)
  const validMoves = calculateValidMoves(state, turn.diceValue);
  const chosenMove = validMoves.find(m => m.tokenId === tokenId);
  if (!chosenMove) throw 'INVALID_MOVE';

  // Apply the move to the token
  let newState = moveToken(state, player.playerId, tokenId, chosenMove);

  // Apply captures if any
  if (chosenMove.captures && chosenMove.toZone === 'BOARD' && chosenMove.toIndex !== null) {
    const captureResult = checkCapture(newState, playerId, player.color, chosenMove.toIndex);
    newState = applyCaptures(newState, captureResult);
  }

  // Mark turn as complete
  newState = {
    ...newState,
    turn: {
      ...newState.turn!,
      phase: 'TURN_COMPLETE',
    },
  };

  return newState;
}

/**
 * Update the state with the token's new position (immutable).
 */
function moveToken(
  state: RoomState,
  playerId: PlayerId,
  tokenId: TokenId,
  move: ValidMove
): RoomState {
  const newPlayers = state.players.map((player): PlayerState => {
    if (player.playerId !== playerId) return player;

    const newTokens = player.tokens.map((token): TokenState => {
      if (token.tokenId !== tokenId) return token;

      if (move.toZone === 'FINISHED') {
        return { ...token, position: { zone: 'FINISHED' } };
      }
      return {
        ...token,
        position: { zone: 'BOARD', boardIndex: move.toIndex! },
      };
    });

    return {
      ...player,
      tokens: newTokens as [TokenState, TokenState, TokenState, TokenState],
    };
  });

  return { ...state, players: newPlayers };
}

/**
 * Check if the current player has any valid moves for the given dice value.
 */
export function hasAnyValidMove(state: RoomState, diceValue: number): boolean {
  return calculateValidMoves(state, diceValue).length > 0;
}
