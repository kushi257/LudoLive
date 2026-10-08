// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the Ludo game engine.
// Zero networking dependencies — pure game domain types only.
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerId = string; // UUID v4 session token
export type RoomId = string;   // UUID v4
export type Color = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
export type TokenId = 0 | 1 | 2 | 3;
export type Phase = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
export type PlayerStatus = 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'FINISHED';

// ── Token Position ─────────────────────────────────────────────────────────
// Positions are color-normalized:
//   BOARD zone: 0–51 = main track (clockwise from this color's start)
//               52–56 = home column (only this color's tokens may enter)
//               57    = finished (alias: use FINISHED zone instead)
//   HOME  zone: token not yet in play
//   FINISHED zone: token safely home — done

export type TokenZone = 'HOME' | 'BOARD' | 'FINISHED';

export type TokenPosition =
  | { zone: 'HOME' }
  | { zone: 'BOARD'; boardIndex: number } // 0–56
  | { zone: 'FINISHED' };

export interface TokenState {
  tokenId: TokenId;
  position: TokenPosition;
}

// ── Valid Move Descriptor ─────────────────────────────────────────────────
// Sent to clients so the UI can highlight legal tokens.
// Client echoes back tokenId only; server re-validates before applying.
export interface ValidMove {
  tokenId: TokenId;
  fromZone: TokenZone;
  toZone: TokenZone;
  toIndex: number | null; // null for FINISHED zone
  captures: boolean;      // will this move capture an opponent token?
}

// ── Turn State ────────────────────────────────────────────────────────────
export type TurnPhase = 'AWAITING_ROLL' | 'AWAITING_MOVE' | 'TURN_COMPLETE';

export interface TurnState {
  currentPlayerSlot: number;   // index into RoomState.players[]
  diceValue: number | null;    // null = not yet rolled this turn
  consecutiveSixes: number;    // 0–2; on 3rd six: forced pass, reset to 0
  phase: TurnPhase;
  validMoves: ValidMove[];     // precomputed after roll (UX hint — re-validated on move)
  turnStartedAt: number;       // epoch ms
}

// ── Player State ──────────────────────────────────────────────────────────
export interface PlayerState {
  playerId: PlayerId;            // session token — permanent slot identifier
  color: Color;
  slot: number;                  // 0–3; determines color and board start position
  tokens: [TokenState, TokenState, TokenState, TokenState];
  status: PlayerStatus;
  isBot?: boolean;
  name?: string;
  disconnectedAt: number | null; // epoch ms; null when connected
  // NOTE: forfeitTimerRef is stored server-side in a Map, never in RoomState
}

// ── Room / Game State ─────────────────────────────────────────────────────
// SCALE-NOTE: In a multi-instance deployment, this entire structure
// would be serialized to Redis under key `room:{roomId}`.
export interface RoomState {
  roomId: RoomId;
  phase: Phase;
  players: PlayerState[];        // ordered by slot; length 2–4
  turn: TurnState | null;        // null when phase !== 'IN_PROGRESS'
  winner: PlayerId | null;
  createdAt: number;             // epoch ms
  startedAt: number | null;      // epoch ms
}

// ── Error Codes ───────────────────────────────────────────────────────────
export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'INVALID_PHASE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED';

export interface GameError {
  code: ErrorCode;
  message: string;
}
