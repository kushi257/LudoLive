// ─────────────────────────────────────────────────────────────────────────────
// Room / Session Manager.
// In-memory store. Zero networking dependencies.
//
// SCALE-NOTE: Every write to `rooms` and `sessionMaps` would correspond to
// a Redis HSET/SET call in a multi-instance deployment. The key structure
// would be: room:{roomId} → serialized RoomState, session:{token} → roomId.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import {
  RoomState,
  PlayerState,
  TokenState,
  TokenId,
  PlayerId,
  RoomId,
  Color,
  GameError,
} from '../engine/types';
import { slotToColor } from '../engine/boardLayout';
import { initTurn, forfeitCurrentTurn } from '../engine/turns';

// ── In-Memory Store ──────────────────────────────────────────────────────────
// SCALE-NOTE: Replace with Redis client calls throughout.
const rooms = new Map<RoomId, RoomState>();

// Maps a session token → roomId (for fast reconnect lookup)
// SCALE-NOTE: Redis key `session:{token}` → roomId, TTL = session lifetime
const sessionToRoom = new Map<PlayerId, RoomId>();

// Forfeit timers: stored outside RoomState so they're never serialized to clients
export const forfeitTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();

// ── Token Factory ─────────────────────────────────────────────────────────────

function makeInitialTokens(): [TokenState, TokenState, TokenState, TokenState] {
  return [
    { tokenId: 0, position: { zone: 'HOME' } },
    { tokenId: 1, position: { zone: 'HOME' } },
    { tokenId: 2, position: { zone: 'HOME' } },
    { tokenId: 3, position: { zone: 'HOME' } },
  ];
}

// ── Room CRUD ─────────────────────────────────────────────────────────────────

export function createRoom(): RoomState {
  const roomId = uuidv4();
  const state: RoomState = {
    roomId,
    phase: 'WAITING',
    players: [],
    turn: null,
    winner: null,
    createdAt: Date.now(),
    startedAt: null,
  };
  rooms.set(roomId, state);
  // SCALE-NOTE: Redis HSET room:{roomId} ...serialized state
  return state;
}

export function getRoom(roomId: RoomId): RoomState | null {
  return rooms.get(roomId) ?? null;
}

export function updateRoom(state: RoomState): void {
  rooms.set(state.roomId, state);
  // SCALE-NOTE: Redis HSET room:{roomId} ...serialized state
}

export function listRoomIds(): RoomId[] {
  return Array.from(rooms.keys());
}

export function deleteRoom(roomId: RoomId): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;

  // Clear timers and session mappings
  for (const player of room.players) {
    const timer = forfeitTimers.get(player.playerId);
    if (timer) {
      clearTimeout(timer);
      forfeitTimers.delete(player.playerId);
    }
    sessionToRoom.delete(player.playerId);
  }

  rooms.delete(roomId);
  return true;
}

// ── Player Join ───────────────────────────────────────────────────────────────

export interface JoinResult {
  sessionToken: PlayerId;
  slot: number;
  color: Color;
  isReconnect: boolean;
}

/**
 * Join a room. Handles both new joins and reconnects.
 * - If sessionToken provided and matches a player in the room → reconnect
 * - If sessionToken provided but not found in room → treat as new join (token ignored)
 * - If room is full → error
 */
export function joinRoom(
  roomId: RoomId,
  sessionToken?: string
): JoinResult | GameError {
  const room = rooms.get(roomId);
  if (!room) return { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} not found` };
  if (room.phase === 'FINISHED') return { code: 'GAME_ALREADY_STARTED', message: 'Game already finished' };

  // Check for reconnect
  if (sessionToken) {
    const player = room.players.find(p => p.playerId === sessionToken);
    if (player) {
      return {
        sessionToken: player.playerId,
        slot: player.slot,
        color: player.color,
        isReconnect: true,
      };
    }
  }

  // New join
  if (room.phase === 'IN_PROGRESS') {
    return { code: 'GAME_ALREADY_STARTED', message: 'Game already in progress' };
  }
  if (room.players.length >= 4) {
    return { code: 'ROOM_FULL', message: 'Room is full (max 4 players)' };
  }

  const slot = room.players.length;
  const color = slotToColor(slot);
  const newToken = uuidv4();

  const player: PlayerState = {
    playerId: newToken,
    color,
    slot,
    tokens: makeInitialTokens(),
    status: 'CONNECTED',
    disconnectedAt: null,
  };

  const updatedRoom: RoomState = {
    ...room,
    players: [...room.players, player],
  };
  rooms.set(roomId, updatedRoom);
  sessionToRoom.set(newToken, roomId);
  // SCALE-NOTE: Redis SET session:{newToken} roomId EX 86400

  return { sessionToken: newToken, slot, color, isReconnect: false };
}

// ── Bot Management ────────────────────────────────────────────────────────────

const BOT_NAMES = ['Aero Bot', 'Cyber Bot', 'Quantum Bot', 'Nova Bot'];

export function addBot(roomId: RoomId): { player: PlayerState; room: RoomState } | GameError {
  const room = rooms.get(roomId);
  if (!room) return { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} not found` };
  if (room.phase !== 'WAITING') return { code: 'GAME_ALREADY_STARTED', message: 'Game already started' };
  if (room.players.length >= 4) return { code: 'ROOM_FULL', message: 'Room is full (max 4 players)' };

  const slot = room.players.length;
  const color = slotToColor(slot);
  const botId = `bot-${uuidv4().slice(0, 8)}`;
  const botName = BOT_NAMES[slot] || `Bot ${slot + 1}`;

  const botPlayer: PlayerState = {
    playerId: botId,
    color,
    slot,
    tokens: makeInitialTokens(),
    status: 'CONNECTED',
    isBot: true,
    name: botName,
    disconnectedAt: null,
  };

  const updatedRoom: RoomState = {
    ...room,
    players: [...room.players, botPlayer],
  };

  rooms.set(roomId, updatedRoom);
  return { player: botPlayer, room: updatedRoom };
}

export function removeBot(roomId: RoomId, botId?: string): RoomState | GameError {
  const room = rooms.get(roomId);
  if (!room) return { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} not found` };
  if (room.phase !== 'WAITING') return { code: 'GAME_ALREADY_STARTED', message: 'Game already started' };

  let targetIndex = -1;
  if (botId) {
    targetIndex = room.players.findIndex(p => p.playerId === botId && p.isBot);
  } else {
    // Remove the latest bot
    for (let i = room.players.length - 1; i >= 0; i--) {
      if (room.players[i].isBot) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) {
    return { code: 'SESSION_NOT_FOUND', message: 'No bot found to remove' };
  }

  const remainingPlayers = room.players.filter((_, idx) => idx !== targetIndex);
  // Re-assign slots and colors to maintain consecutive 0..n ordering
  const reindexedPlayers: PlayerState[] = remainingPlayers.map((p, idx) => ({
    ...p,
    slot: idx,
    color: slotToColor(idx),
  }));

  const updatedRoom: RoomState = {
    ...room,
    players: reindexedPlayers,
  };

  rooms.set(roomId, updatedRoom);
  return updatedRoom;
}

// ── Game Start ────────────────────────────────────────────────────────────────

/**
 * Start the game. Requires 2–4 players.
 */
export function startGame(roomId: RoomId): RoomState | GameError {
  const room = rooms.get(roomId);
  if (!room) return { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} not found` };
  if (room.players.length < 2) return { code: 'INVALID_PHASE', message: 'Need at least 2 players to start' };
  if (room.phase !== 'WAITING') return { code: 'GAME_ALREADY_STARTED', message: 'Game already started' };

  const started: RoomState = {
    ...room,
    phase: 'IN_PROGRESS',
    startedAt: Date.now(),
  };
  const withTurn = initTurn(started);
  rooms.set(roomId, withTurn);
  return withTurn;
}

// ── Reconnect ─────────────────────────────────────────────────────────────────

/**
 * Mark a player as reconnected. Cancels their forfeit timer.
 * Returns the full current RoomState for resync.
 */
export function reconnectPlayer(
  roomId: RoomId,
  sessionToken: PlayerId
): RoomState | GameError {
  const room = rooms.get(roomId);
  if (!room) return { code: 'ROOM_NOT_FOUND', message: `Room ${roomId} not found` };

  const playerIdx = room.players.findIndex(p => p.playerId === sessionToken);
  if (playerIdx === -1) return { code: 'SESSION_NOT_FOUND', message: 'Session not found in room' };

  const player = room.players[playerIdx];
  if (player.status === 'FORFEITED') {
    return { code: 'SESSION_EXPIRED', message: 'Player has already been forfeited' };
  }

  // Cancel forfeit timer
  const timer = forfeitTimers.get(sessionToken);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(sessionToken);
    // SCALE-NOTE: Redis DEL forfeit:{sessionToken}
  }

  // Update player status
  const newPlayers = [...room.players];
  newPlayers[playerIdx] = {
    ...player,
    status: 'CONNECTED',
    disconnectedAt: null,
  };

  const updatedRoom = { ...room, players: newPlayers };
  rooms.set(roomId, updatedRoom);
  return updatedRoom;
}

// ── Disconnect / Forfeit ──────────────────────────────────────────────────────

/**
 * Mark a player as disconnected and start their forfeit timer.
 * Returns the updated RoomState.
 */
export function disconnectPlayer(
  roomId: RoomId,
  sessionToken: PlayerId,
  onForfeit: (roomId: RoomId, sessionToken: PlayerId) => void,
  timeoutMs = 60_000
): RoomState | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  const playerIdx = room.players.findIndex(p => p.playerId === sessionToken);
  if (playerIdx === -1) return null;

  const player = room.players[playerIdx];
  if (player.status === 'FORFEITED') return room;

  const now = Date.now();
  const newPlayers = [...room.players];
  newPlayers[playerIdx] = { ...player, status: 'DISCONNECTED', disconnectedAt: now };
  const updatedRoom = { ...room, players: newPlayers };
  rooms.set(roomId, updatedRoom);

  // Start forfeit timer
  // SCALE-NOTE: Redis SET forfeit:{sessionToken} 1 EX 60, worker polls or uses keyspace notification
  const handle = setTimeout(() => onForfeit(roomId, sessionToken), timeoutMs);
  forfeitTimers.set(sessionToken, handle);

  return updatedRoom;
}

/**
 * Forfeit a player (either by timeout or voluntary leave).
 * Returns { newState, turnAdvanced } — turnAdvanced=true if it was their turn.
 */
export function forfeitPlayer(
  roomId: RoomId,
  sessionToken: PlayerId
): { state: RoomState; turnAdvanced: boolean } | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  const playerIdx = room.players.findIndex(p => p.playerId === sessionToken);
  if (playerIdx === -1) return null;

  // Clear any pending timer
  const timer = forfeitTimers.get(sessionToken);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(sessionToken);
  }

  const player = room.players[playerIdx];
  const newPlayers = [...room.players];
  newPlayers[playerIdx] = { ...player, status: 'FORFEITED', disconnectedAt: null };

  let updatedRoom: RoomState = { ...room, players: newPlayers };

  // If it was this player's turn, advance the turn
  let turnAdvanced = false;
  if (
    updatedRoom.turn &&
    updatedRoom.turn.currentPlayerSlot === playerIdx &&
    updatedRoom.phase === 'IN_PROGRESS'
  ) {
    updatedRoom = forfeitCurrentTurn(updatedRoom, playerIdx);
    turnAdvanced = true;
  }

  rooms.set(roomId, updatedRoom);
  return { state: updatedRoom, turnAdvanced };
}

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export function getRoomIdForSession(sessionToken: PlayerId): RoomId | null {
  return sessionToRoom.get(sessionToken) ?? null;
}

export function isGameError(val: unknown): val is GameError {
  return typeof val === 'object' && val !== null && 'code' in val && 'message' in val;
}
