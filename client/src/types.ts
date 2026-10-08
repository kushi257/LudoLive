// Shared types mirroring the server engine types.
// Client never computes outcomes from these — only uses them for rendering.

export type PlayerId = string;
export type RoomId = string;
export type Color = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
export type TokenId = 0 | 1 | 2 | 3;
export type Phase = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';
export type PlayerStatus = 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'FINISHED';
export type TokenZone = 'HOME' | 'BOARD' | 'FINISHED';

export type TokenPosition =
  | { zone: 'HOME' }
  | { zone: 'BOARD'; boardIndex: number }
  | { zone: 'FINISHED' };

export interface TokenState {
  tokenId: TokenId;
  position: TokenPosition;
}

export interface ValidMove {
  tokenId: TokenId;
  fromZone: TokenZone;
  toZone: TokenZone;
  toIndex: number | null;
  captures: boolean;
}

export type TurnPhase = 'AWAITING_ROLL' | 'AWAITING_MOVE' | 'TURN_COMPLETE';

export interface TurnState {
  currentPlayerSlot: number;
  diceValue: number | null;
  consecutiveSixes: number;
  phase: TurnPhase;
  validMoves: ValidMove[];
  turnStartedAt: number;
}

export interface PlayerState {
  playerId: PlayerId;
  color: Color;
  slot: number;
  tokens: [TokenState, TokenState, TokenState, TokenState];
  status: PlayerStatus;
  isBot?: boolean;
  name?: string;
  disconnectedAt: number | null;
}

export interface RoomState {
  roomId: RoomId;
  phase: Phase;
  players: PlayerState[];
  turn: TurnState | null;
  winner: PlayerId | null;
  createdAt: number;
  startedAt: number | null;
}

export interface JoinResult {
  sessionToken: PlayerId;
  slot: number;
  color: Color;
  isReconnect: boolean;
}

export interface GameError {
  code: string;
  message: string;
}
