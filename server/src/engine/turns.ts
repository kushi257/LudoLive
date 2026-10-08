// ─────────────────────────────────────────────────────────────────────────────
// Turn order management.
// Handles: normal turn advance, extra turn on 6, three-consecutive-6 pass,
// skipping forfeited players, and turn initialization.
// ─────────────────────────────────────────────────────────────────────────────

import { RoomState, TurnState, PlayerState } from './types';
import { calculateValidMoves, hasAnyValidMove } from './moves';
import { rollDice } from './dice';

const MAX_CONSECUTIVE_SIXES = 3;

/**
 * Initialize the turn state at game start.
 * Slot 0 goes first.
 */
export function initTurn(state: RoomState): RoomState {
  const firstActiveSlot = findNextActiveSlot(state, -1);
  if (firstActiveSlot === -1) return state; // no active players (shouldn't happen)

  const turn: TurnState = {
    currentPlayerSlot: firstActiveSlot,
    diceValue: null,
    consecutiveSixes: 0,
    phase: 'AWAITING_ROLL',
    validMoves: [],
    turnStartedAt: Date.now(),
  };

  return { ...state, turn };
}

/**
 * Process a dice roll for the current player.
 * - Rolls the dice
 * - Handles third-consecutive-six (pass)
 * - Calculates valid moves
 * - Advances to AWAITING_MOVE or auto-advances turn if no moves possible
 *
 * Returns updated RoomState.
 * Throws an error string (ErrorCode) if the roll is not allowed.
 */
export function processDiceRoll(state: RoomState): RoomState {
  const turn = state.turn;
  if (!turn) throw 'GAME_NOT_STARTED';
  if (turn.phase !== 'AWAITING_ROLL') throw 'INVALID_PHASE';

  const diceValue = rollDice();
  const isSix = diceValue === 6;
  const newConsecutiveSixes = isSix ? turn.consecutiveSixes + 1 : 0;

  // Three consecutive sixes: forced pass (no move this turn)
  if (newConsecutiveSixes >= MAX_CONSECUTIVE_SIXES) {
    const nextSlot = findNextActiveSlot(state, turn.currentPlayerSlot);
    const newTurn: TurnState = {
      currentPlayerSlot: nextSlot,
      diceValue: null,
      consecutiveSixes: 0, // reset after forced pass
      phase: 'AWAITING_ROLL',
      validMoves: [],
      turnStartedAt: Date.now(),
    };
    return { ...state, turn: { ...state.turn!, diceValue, consecutiveSixes: newConsecutiveSixes, phase: 'TURN_COMPLETE', validMoves: [] } };
    // Note: caller (socket handler) will see TURN_COMPLETE and call advanceTurn
    // We attach the dice value so clients see what was rolled before the pass
  }

  const stateWithDice: RoomState = {
    ...state,
    turn: {
      ...turn,
      diceValue,
      consecutiveSixes: newConsecutiveSixes,
      phase: 'AWAITING_MOVE',
    },
  };

  const validMoves = calculateValidMoves(stateWithDice, diceValue);

  if (validMoves.length === 0) {
    // No moves possible: auto-advance turn
    return {
      ...stateWithDice,
      turn: {
        ...stateWithDice.turn!,
        validMoves: [],
        phase: 'TURN_COMPLETE',
      },
    };
  }

  return {
    ...stateWithDice,
    turn: {
      ...stateWithDice.turn!,
      validMoves,
      phase: 'AWAITING_MOVE',
    },
  };
}

/**
 * Advance to the next turn after the current turn is complete.
 * - Extra turn on 6 (unless consecutiveSixes has been forced-passed)
 * - Otherwise advance to the next active player
 */
export function advanceTurn(state: RoomState): RoomState {
  const turn = state.turn;
  if (!turn) return state;

  const rolledSix = turn.diceValue === 6;
  const wasThreeSixes = turn.consecutiveSixes >= MAX_CONSECUTIVE_SIXES;

  let nextSlot: number;
  let nextConsecutiveSixes: number;

  if (rolledSix && !wasThreeSixes) {
    // Extra turn for the same player
    nextSlot = turn.currentPlayerSlot;
    nextConsecutiveSixes = turn.consecutiveSixes; // preserved (1 or 2)
  } else {
    // Normal advance or forced pass after three sixes
    nextSlot = findNextActiveSlot(state, turn.currentPlayerSlot);
    nextConsecutiveSixes = 0;
  }

  const newTurn: TurnState = {
    currentPlayerSlot: nextSlot,
    diceValue: null,
    consecutiveSixes: nextConsecutiveSixes,
    phase: 'AWAITING_ROLL',
    validMoves: [],
    turnStartedAt: Date.now(),
  };

  return { ...state, turn: newTurn };
}

/**
 * Find the next slot with an active (CONNECTED or DISCONNECTED) player,
 * wrapping around. 'DISCONNECTED' players are still in the rotation
 * (they may reconnect); 'FORFEITED' players are skipped.
 *
 * @param currentSlot - the slot to start searching AFTER (-1 = start from beginning)
 */
export function findNextActiveSlot(state: RoomState, currentSlot: number): number {
  const total = state.players.length;
  for (let i = 1; i <= total; i++) {
    const candidate = (currentSlot + i) % total;
    const player = state.players[candidate];
    if (player && player.status !== 'FORFEITED' && player.status !== 'FINISHED') {
      return candidate;
    }
  }
  return -1; // no active players
}

/**
 * When a player is forfeited mid-turn, forcibly advance the turn.
 */
export function forfeitCurrentTurn(state: RoomState, forfeitedSlot: number): RoomState {
  const turn = state.turn;
  if (!turn) return state;

  // If it was the forfeited player's turn, advance
  if (turn.currentPlayerSlot === forfeitedSlot) {
    return advanceTurn({
      ...state,
      turn: { ...turn, phase: 'TURN_COMPLETE', diceValue: null },
    });
  }

  return state;
}
