// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for the Ludo game engine.
// Tests cover: board layout, dice, moves, capture, turns, and win conditions.
// Zero networking — pure game logic only.
// ─────────────────────────────────────────────────────────────────────────────

import { RoomState, PlayerState, TokenState, TokenId } from '../types';
import { normalizedToPhysical, physicalToNormalized, isSafeSquare, MAIN_TRACK_LENGTH } from '../boardLayout';
import { rollDice } from '../dice';
import { calculateValidMoves, applyMove, hasAnyValidMove } from '../moves';
import { checkCapture, applyCaptures } from '../capture';
import { checkWin, checkWinByElimination } from '../win';
import { initTurn, processDiceRoll, advanceTurn, forfeitCurrentTurn } from '../turns';

// ── Test Helpers ─────────────────────────────────────────────────────────────

function makeToken(tokenId: TokenId, zone: 'HOME' | 'FINISHED'): TokenState;
function makeToken(tokenId: TokenId, zone: 'BOARD', boardIndex: number): TokenState;
function makeToken(tokenId: TokenId, zone: 'HOME' | 'BOARD' | 'FINISHED', boardIndex?: number): TokenState {
  if (zone === 'BOARD') {
    return { tokenId, position: { zone: 'BOARD', boardIndex: boardIndex! } };
  }
  return { tokenId, position: { zone } };
}

function makePlayer(
  slot: number,
  tokens: [TokenState, TokenState, TokenState, TokenState],
  status: PlayerState['status'] = 'CONNECTED'
): PlayerState {
  const colors: Array<PlayerState['color']> = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
  return {
    playerId: `player-${slot}`,
    color: colors[slot],
    slot,
    tokens,
    status,
    disconnectedAt: null,
  };
}

function makeRoom(players: PlayerState[], currentSlot = 0): RoomState {
  return {
    roomId: 'room-1',
    phase: 'IN_PROGRESS',
    players,
    turn: {
      currentPlayerSlot: currentSlot,
      diceValue: null,
      consecutiveSixes: 0,
      phase: 'AWAITING_ROLL',
      validMoves: [],
      turnStartedAt: Date.now(),
    },
    winner: null,
    createdAt: Date.now(),
    startedAt: Date.now(),
  };
}

const allHome = (): [TokenState, TokenState, TokenState, TokenState] => [
  makeToken(0, 'HOME'),
  makeToken(1, 'HOME'),
  makeToken(2, 'HOME'),
  makeToken(3, 'HOME'),
];

const allFinished = (): [TokenState, TokenState, TokenState, TokenState] => [
  makeToken(0, 'FINISHED'),
  makeToken(1, 'FINISHED'),
  makeToken(2, 'FINISHED'),
  makeToken(3, 'FINISHED'),
];

// ── Board Layout Tests ────────────────────────────────────────────────────────

describe('boardLayout', () => {
  test('normalizedToPhysical: RED at 0 → physical 0', () => {
    expect(normalizedToPhysical('RED', 0)).toBe(0);
  });

  test('normalizedToPhysical: GREEN at 0 → physical 13', () => {
    expect(normalizedToPhysical('GREEN', 0)).toBe(13);
  });

  test('normalizedToPhysical: YELLOW at 0 → physical 26', () => {
    expect(normalizedToPhysical('YELLOW', 0)).toBe(26);
  });

  test('normalizedToPhysical: BLUE at 0 → physical 39', () => {
    expect(normalizedToPhysical('BLUE', 0)).toBe(39);
  });

  test('normalizedToPhysical: RED wraps around at 51 → physical 51', () => {
    expect(normalizedToPhysical('RED', 51)).toBe(51);
  });

  test('normalizedToPhysical: GREEN at 51 → wraps correctly', () => {
    // GREEN starts at 13, so 13+51 = 64, 64 % 52 = 12
    expect(normalizedToPhysical('GREEN', 51)).toBe((13 + 51) % MAIN_TRACK_LENGTH);
  });

  test('physicalToNormalized: physical 0 for RED → 0', () => {
    expect(physicalToNormalized('RED', 0)).toBe(0);
  });

  test('physicalToNormalized: physical 13 for GREEN → 0', () => {
    expect(physicalToNormalized('GREEN', 13)).toBe(0);
  });

  test('physicalToNormalized: round-trip for all colors', () => {
    for (const color of ['RED', 'GREEN', 'YELLOW', 'BLUE'] as const) {
      for (let i = 0; i < 52; i++) {
        const phys = normalizedToPhysical(color, i);
        const back = physicalToNormalized(color, phys);
        expect(back).toBe(i);
      }
    }
  });

  test('isSafeSquare: index 0 is safe', () => {
    expect(isSafeSquare(0)).toBe(true);
  });

  test('isSafeSquare: index 8 is safe', () => {
    expect(isSafeSquare(8)).toBe(true);
  });

  test('isSafeSquare: index 5 is NOT safe', () => {
    expect(isSafeSquare(5)).toBe(false);
  });

  test('isSafeSquare: home column 52+ is safe', () => {
    expect(isSafeSquare(52)).toBe(true);
    expect(isSafeSquare(56)).toBe(true);
  });
});

// ── Dice Tests ────────────────────────────────────────────────────────────────

describe('dice', () => {
  test('rollDice returns a value between 1 and 6 inclusive', () => {
    for (let i = 0; i < 1000; i++) {
      const val = rollDice();
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  test('rollDice produces all values over many rolls', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      seen.add(rollDice());
    }
    expect(seen.size).toBe(6);
  });
});

// ── Valid Move Tests ──────────────────────────────────────────────────────────

describe('calculateValidMoves', () => {
  test('all tokens HOME, dice != 6 → no valid moves', () => {
    const player0 = makePlayer(0, allHome());
    const player1 = makePlayer(1, allHome());
    const room = makeRoom([player0, player1]);
    room.turn!.diceValue = 3;
    expect(calculateValidMoves(room, 3)).toHaveLength(0);
  });

  test('all tokens HOME, dice = 6 → 4 valid moves (one per token)', () => {
    const player0 = makePlayer(0, allHome());
    const player1 = makePlayer(1, allHome());
    const room = makeRoom([player0, player1]);
    const moves = calculateValidMoves(room, 6);
    expect(moves).toHaveLength(4);
    expect(moves.every(m => m.fromZone === 'HOME' && m.toIndex === 0)).toBe(true);
  });

  test('token on board, dice 3 → advances 3 squares', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 10),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, tokens);
    const player1 = makePlayer(1, allHome());
    const room = makeRoom([player0, player1]);
    const moves = calculateValidMoves(room, 3);
    const tokenMove = moves.find(m => m.tokenId === 0);
    expect(tokenMove).toBeDefined();
    expect(tokenMove!.toIndex).toBe(13);
  });

  test('token cannot overshoot home column end (HOME_COLUMN_END = 56)', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 55), // at home column square 55, needs 1 to finish
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, tokens);
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    // dice=3 would put at 58, which overshoots — no valid move for this token
    const moves = calculateValidMoves(room, 3);
    expect(moves.find(m => m.tokenId === 0)).toBeUndefined();
  });

  test('token can finish exactly (boardIndex 56 + dice 1 = 57 = FINISHED)', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 56),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, tokens);
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    const moves = calculateValidMoves(room, 1);
    const finishMove = moves.find(m => m.tokenId === 0);
    expect(finishMove).toBeDefined();
    expect(finishMove!.toZone).toBe('FINISHED');
  });

  test('FINISHED tokens do not generate moves', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'FINISHED'),
      makeToken(1, 'FINISHED'),
      makeToken(2, 'FINISHED'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, tokens);
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    const moves = calculateValidMoves(room, 6);
    // Only token 3 (HOME) can move with a 6
    expect(moves).toHaveLength(1);
    expect(moves[0].tokenId).toBe(3);
  });

  test('token wraps around main track (e.g., boardIndex 50 + dice 5 wraps)', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 50),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, tokens);
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    const moves = calculateValidMoves(room, 5);
    const move = moves.find(m => m.tokenId === 0);
    // 50 + 5 = 55 → but wait, 55 >= 52 means home column entry only if token
    // has gone all the way around. Actually we need to check the index logic:
    // 50 + 5 = 55 which is within HOME_COLUMN range (52-56), so it's valid.
    expect(move).toBeDefined();
    expect(move!.toIndex).toBe(55);
  });
});

// ── Apply Move Tests ──────────────────────────────────────────────────────────

describe('applyMove', () => {
  test('moves token from HOME to BOARD on dice 6', () => {
    const player0 = makePlayer(0, allHome());
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    const stateWithDice: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 6, phase: 'AWAITING_MOVE', validMoves: calculateValidMoves(room, 6) },
    };
    const newState = applyMove(stateWithDice, 'player-0', 0);
    const token = newState.players[0].tokens[0];
    expect(token.position.zone).toBe('BOARD');
    expect((token.position as any).boardIndex).toBe(0);
  });

  test('throws NOT_YOUR_TURN for wrong player', () => {
    const player0 = makePlayer(0, allHome());
    const player1 = makePlayer(1, [makeToken(0, 'BOARD', 5), makeToken(1, 'HOME'), makeToken(2, 'HOME'), makeToken(3, 'HOME')]);
    const room = makeRoom([player0, player1], 0); // player 0's turn
    const stateWithDice: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 3, phase: 'AWAITING_MOVE', validMoves: [] },
    };
    expect(() => applyMove(stateWithDice, 'player-1', 0)).toThrow('NOT_YOUR_TURN');
  });

  test('throws INVALID_MOVE for token not in validMoves', () => {
    const player0 = makePlayer(0, allHome());
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    // Dice = 3, all tokens HOME → no valid moves
    const stateWithDice: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 3, phase: 'AWAITING_MOVE', validMoves: [] },
    };
    expect(() => applyMove(stateWithDice, 'player-0', 0)).toThrow('INVALID_MOVE');
  });

  test('throws INVALID_PHASE when phase is not AWAITING_MOVE', () => {
    const player0 = makePlayer(0, allHome());
    const room = makeRoom([player0, makePlayer(1, allHome())]);
    // Phase is AWAITING_ROLL, not AWAITING_MOVE
    expect(() => applyMove(room, 'player-0', 0)).toThrow('INVALID_PHASE');
  });
});

// ── Capture Tests ─────────────────────────────────────────────────────────────

describe('capture', () => {
  test('landing on opponent token on non-safe square → capture', () => {
    const p0tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 4), // will land on square 5 with dice 1
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    // GREEN's normalized index 0 corresponds to physical 13
    // Physical 5 corresponds to... need to find where RED lands
    // RED at normalized 4, moving with dice 1 → lands at normalized 5
    // Physical for RED at 5 = 5
    // GREEN token at normalized index: physicalToNormalized(GREEN, 5) = (5 - 13 + 52) % 52 = 44
    const p1tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 44), // GREEN token at physical square 5
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, p0tokens); // RED
    const player1 = makePlayer(1, p1tokens); // GREEN
    const room = makeRoom([player0, player1]);

    // RED moves to normalized index 5 (physical 5)
    const result = checkCapture(room, 'player-0', 'RED', 5);
    expect(result.capturedTokens).toHaveLength(1);
    expect(result.capturedTokens[0].ownerId).toBe('player-1');
    expect(result.capturedTokens[0].tokenId).toBe(0);
  });

  test('landing on safe square → no capture', () => {
    // RED lands on normalized index 0 (safe square = start)
    // GREEN also at physical 0 (GREEN normalized = physicalToNormalized(GREEN, 0) = (0-13+52)%52 = 39)
    const p0tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'HOME'),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const p1tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 39), // GREEN at physical square 0 (RED's start)
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, p0tokens);
    const player1 = makePlayer(1, p1tokens);
    const room = makeRoom([player0, player1]);

    const result = checkCapture(room, 'player-0', 'RED', 0);
    expect(result.capturedTokens).toHaveLength(0);
  });

  test('applyCaptures resets captured token to HOME', () => {
    const p0tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 4),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const p1tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 44), // at physical 5 (same as RED at norm 5)
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, p0tokens);
    const player1 = makePlayer(1, p1tokens);
    const room = makeRoom([player0, player1]);

    const captures = { capturedTokens: [{ ownerId: 'player-1', tokenId: 0 as TokenId }] };
    const newState = applyCaptures(room, captures);
    expect(newState.players[1].tokens[0].position.zone).toBe('HOME');
  });

  test('cannot capture own tokens', () => {
    const p0tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 4),
      makeToken(1, 'BOARD', 4), // same square as token 0
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, p0tokens);
    const room = makeRoom([player0, makePlayer(1, allHome())]);

    const result = checkCapture(room, 'player-0', 'RED', 4);
    expect(result.capturedTokens).toHaveLength(0);
  });

  test('cannot capture token in home column (boardIndex >= 52)', () => {
    const p0tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 10),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    // GREEN token at boardIndex 52 (home column)
    const p1tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 52),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const player0 = makePlayer(0, p0tokens);
    const player1 = makePlayer(1, p1tokens);
    const room = makeRoom([player0, player1]);

    // No matter what index we check, home column tokens are immune
    const result = checkCapture(room, 'player-0', 'RED', 52);
    expect(result.capturedTokens).toHaveLength(0);
  });
});

// ── Turn Order Tests ──────────────────────────────────────────────────────────

describe('turns', () => {
  test('initTurn starts with slot 0', () => {
    const room: RoomState = {
      roomId: 'r', phase: 'IN_PROGRESS',
      players: [makePlayer(0, allHome()), makePlayer(1, allHome())],
      turn: null, winner: null, createdAt: 0, startedAt: 0,
    };
    const newRoom = initTurn(room);
    expect(newRoom.turn!.currentPlayerSlot).toBe(0);
    expect(newRoom.turn!.phase).toBe('AWAITING_ROLL');
  });

  test('advanceTurn moves to next player on non-6', () => {
    const room = makeRoom([makePlayer(0, allHome()), makePlayer(1, allHome())]);
    const completedRoom: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 3, phase: 'TURN_COMPLETE', consecutiveSixes: 0 },
    };
    const advanced = advanceTurn(completedRoom);
    expect(advanced.turn!.currentPlayerSlot).toBe(1);
    expect(advanced.turn!.phase).toBe('AWAITING_ROLL');
  });

  test('advanceTurn gives extra turn on 6', () => {
    const room = makeRoom([makePlayer(0, allHome()), makePlayer(1, allHome())]);
    const completedRoom: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 6, phase: 'TURN_COMPLETE', consecutiveSixes: 1 },
    };
    const advanced = advanceTurn(completedRoom);
    // Same player gets another turn
    expect(advanced.turn!.currentPlayerSlot).toBe(0);
    expect(advanced.turn!.consecutiveSixes).toBe(1);
  });

  test('advanceTurn skips forfeited player', () => {
    const player0 = makePlayer(0, allHome());
    const player1 = makePlayer(1, allHome(), 'FORFEITED');
    const player2 = makePlayer(2, allHome());
    const room = makeRoom([player0, player1, player2], 0);
    const completedRoom: RoomState = {
      ...room,
      turn: { ...room.turn!, diceValue: 3, phase: 'TURN_COMPLETE', consecutiveSixes: 0 },
    };
    const advanced = advanceTurn(completedRoom);
    // Skips slot 1 (forfeited), goes to slot 2
    expect(advanced.turn!.currentPlayerSlot).toBe(2);
  });

  test('three consecutive sixes → TURN_COMPLETE (forced pass)', () => {
    const tokens: [TokenState, TokenState, TokenState, TokenState] = [
      makeToken(0, 'BOARD', 5),
      makeToken(1, 'HOME'),
      makeToken(2, 'HOME'),
      makeToken(3, 'HOME'),
    ];
    const room = makeRoom([makePlayer(0, tokens), makePlayer(1, allHome())]);
    const twoSixesRoom: RoomState = {
      ...room,
      turn: { ...room.turn!, consecutiveSixes: 2, phase: 'AWAITING_ROLL' },
    };

    // processDiceRoll internally calls rollDice(), but we can test by
    // patching consecutiveSixes to 3 directly and checking advanceTurn
    const thirdSixRoom: RoomState = {
      ...twoSixesRoom,
      turn: { ...twoSixesRoom.turn!, diceValue: 6, consecutiveSixes: 3, phase: 'TURN_COMPLETE' },
    };
    const advanced = advanceTurn(thirdSixRoom);
    // After forced pass, consecutive sixes reset and turn advances
    expect(advanced.turn!.currentPlayerSlot).toBe(1);
    expect(advanced.turn!.consecutiveSixes).toBe(0);
  });

  test('forfeitCurrentTurn advances turn when forfeited player was current', () => {
    const room = makeRoom([makePlayer(0, allHome()), makePlayer(1, allHome())]);
    const forfeitedRoom: RoomState = {
      ...room,
      players: [makePlayer(0, allHome(), 'FORFEITED'), makePlayer(1, allHome())],
    };
    const advanced = forfeitCurrentTurn(forfeitedRoom, 0);
    expect(advanced.turn!.currentPlayerSlot).toBe(1);
  });
});

// ── Win Condition Tests ───────────────────────────────────────────────────────

describe('win conditions', () => {
  test('checkWin returns null when no player has finished', () => {
    const room = makeRoom([makePlayer(0, allHome()), makePlayer(1, allHome())]);
    expect(checkWin(room)).toBeNull();
  });

  test('checkWin returns winner when all 4 tokens FINISHED', () => {
    const winner = makePlayer(0, allFinished());
    const loser = makePlayer(1, allHome());
    const room = makeRoom([winner, loser]);
    expect(checkWin(room)).toBe('player-0');
  });

  test('checkWin ignores forfeited players', () => {
    // A forfeited player with all tokens "finished" should not win
    const forfeited = makePlayer(0, allFinished(), 'FORFEITED');
    const active = makePlayer(1, allHome());
    const room = makeRoom([forfeited, active]);
    expect(checkWin(room)).toBeNull();
  });

  test('checkWinByElimination: one active player left', () => {
    const forfeited0 = makePlayer(0, allHome(), 'FORFEITED');
    const forfeited1 = makePlayer(1, allHome(), 'FORFEITED');
    const active = makePlayer(2, allHome());
    const room: RoomState = {
      ...makeRoom([forfeited0, forfeited1, active], 2),
    };
    expect(checkWinByElimination(room)).toBe('player-2');
  });

  test('checkWinByElimination: two active players → null', () => {
    const room = makeRoom([makePlayer(0, allHome()), makePlayer(1, allHome())]);
    expect(checkWinByElimination(room)).toBeNull();
  });
});

// ── Bot AI Tests ──────────────────────────────────────────────────────────────

describe('bot AI', () => {
  const { chooseBotMove } = require('../bot');

  test('prioritizes capture over normal move', () => {
    const botPlayer: PlayerState = {
      ...makePlayer(0, [
        makeToken(0, 'BOARD', 10),
        makeToken(1, 'BOARD', 20),
        makeToken(2, 'HOME'),
        makeToken(3, 'HOME'),
      ]),
      isBot: true,
    };
    const room = makeRoom([botPlayer, makePlayer(1, allHome())]);
    const validMoves = [
      { tokenId: 0, fromZone: 'BOARD', toZone: 'BOARD', toIndex: 13, captures: false },
      { tokenId: 1, fromZone: 'BOARD', toZone: 'BOARD', toIndex: 23, captures: true },
    ];
    const chosen = chooseBotMove(room, 0, validMoves);
    expect(chosen.tokenId).toBe(1);
  });

  test('prioritizes finish over normal move', () => {
    const botPlayer: PlayerState = {
      ...makePlayer(0, [
        makeToken(0, 'BOARD', 56),
        makeToken(1, 'BOARD', 20),
        makeToken(2, 'HOME'),
        makeToken(3, 'HOME'),
      ]),
      isBot: true,
    };
    const room = makeRoom([botPlayer, makePlayer(1, allHome())]);
    const validMoves = [
      { tokenId: 0, fromZone: 'BOARD', toZone: 'FINISHED', toIndex: null, captures: false },
      { tokenId: 1, fromZone: 'BOARD', toZone: 'BOARD', toIndex: 21, captures: false },
    ];
    const chosen = chooseBotMove(room, 0, validMoves);
    expect(chosen.tokenId).toBe(0);
  });
});

