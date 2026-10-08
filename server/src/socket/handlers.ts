// ─────────────────────────────────────────────────────────────────────────────
// Socket.io event handlers — all game events route through here.
// Server is fully authoritative: clients send intents, server validates
// and broadcasts outcomes.
// ─────────────────────────────────────────────────────────────────────────────

import { Server, Socket } from 'socket.io';
import {
  createRoom,
  getRoom,
  updateRoom,
  joinRoom,
  addBot,
  removeBot,
  deleteRoom,
  startGame,
  reconnectPlayer,
  disconnectPlayer,
  forfeitPlayer,
  isGameError,
} from '../rooms/RoomManager';
import { applyMove } from '../engine/moves';
import { processDiceRoll, advanceTurn } from '../engine/turns';
import { checkWin, checkWinByElimination } from '../engine/win';
import { chooseBotMove } from '../engine/bot';
import { RoomState, PlayerId, TokenId, RoomId } from '../engine/types';

// Map socket.id → { roomId, sessionToken } for disconnect handling
const socketMeta = new Map<string, { roomId: RoomId; sessionToken: PlayerId }>();

// Map roomId → active NodeJS.Timeout for bot turns
const botActionTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Sanitize RoomState before sending to clients.
 * Strips server-internal fields that clients should never see.
 */
function sanitize(state: RoomState): Omit<RoomState, never> {
  return state; // All internal-only data (forfeitTimerRef) lives in the separate Map
}

/**
 * After any state change, check for win conditions and finalize if needed.
 */
function checkAndFinalizeWin(io: Server, state: RoomState): RoomState {
  let winner = checkWin(state);
  if (!winner) winner = checkWinByElimination(state);

  if (winner) {
    const finalState: RoomState = {
      ...state,
      phase: 'FINISHED',
      winner,
      turn: null,
    };
    updateRoom(finalState);
    const winnerPlayer = finalState.players.find(p => p.playerId === winner);
    io.to(finalState.roomId).emit('game_over', {
      winnerId: winner,
      winnerSlot: winnerPlayer?.slot ?? -1,
      state: sanitize(finalState),
    });
    return finalState;
  }

  return state;
}

/**
 * If the current turn belongs to an AI Bot, automatically schedule their dice roll / move.
 */
function scheduleBotTurnIfNeeded(io: Server, roomId: string): void {
  const room = getRoom(roomId);
  if (!room || room.phase !== 'IN_PROGRESS' || !room.turn) return;

  const currentPlayer = room.players[room.turn.currentPlayerSlot];
  if (!currentPlayer || !currentPlayer.isBot || currentPlayer.status !== 'CONNECTED') return;

  // Clear any existing pending action for this room
  const existingTimeout = botActionTimeouts.get(roomId);
  if (existingTimeout) clearTimeout(existingTimeout);

  const turnPhase = room.turn.phase;

  if (turnPhase === 'AWAITING_ROLL') {
    const timer = setTimeout(() => {
      botActionTimeouts.delete(roomId);
      const currentRoom = getRoom(roomId);
      if (!currentRoom || currentRoom.phase !== 'IN_PROGRESS' || !currentRoom.turn) return;
      if (currentRoom.turn.currentPlayerSlot !== currentPlayer.slot || currentRoom.turn.phase !== 'AWAITING_ROLL') return;

      try {
        const newState = processDiceRoll(currentRoom);
        updateRoom(newState);

        io.to(roomId).emit('dice_rolled', {
          diceValue: newState.turn!.diceValue,
          validMoves: newState.turn!.validMoves,
          currentPlayerSlot: newState.turn!.currentPlayerSlot,
          consecutiveSixes: newState.turn!.consecutiveSixes,
        });

        if (newState.turn!.phase === 'TURN_COMPLETE') {
          // Auto advance turn
          const advanced = advanceTurn(newState);
          updateRoom(advanced);
          io.to(roomId).emit('state_update', sanitize(advanced));
          scheduleBotTurnIfNeeded(io, roomId);
        } else if (newState.turn!.phase === 'AWAITING_MOVE') {
          scheduleBotTurnIfNeeded(io, roomId);
        }
      } catch (err) {
        console.error('[bot roll error]', err);
      }
    }, 800);

    botActionTimeouts.set(roomId, timer);
  } else if (turnPhase === 'AWAITING_MOVE') {
    const timer = setTimeout(() => {
      botActionTimeouts.delete(roomId);
      const currentRoom = getRoom(roomId);
      if (!currentRoom || currentRoom.phase !== 'IN_PROGRESS' || !currentRoom.turn) return;
      if (currentRoom.turn.currentPlayerSlot !== currentPlayer.slot || currentRoom.turn.phase !== 'AWAITING_MOVE') return;

      const validMoves = currentRoom.turn.validMoves;
      const chosenMove = chooseBotMove(currentRoom, currentPlayer.slot, validMoves);

      if (!chosenMove) {
        const advanced = advanceTurn(currentRoom);
        updateRoom(advanced);
        io.to(roomId).emit('state_update', sanitize(advanced));
        scheduleBotTurnIfNeeded(io, roomId);
        return;
      }

      try {
        const stateAfterMove = applyMove(currentRoom, currentPlayer.playerId, chosenMove.tokenId);
        let finalState = advanceTurn(stateAfterMove);
        finalState = checkAndFinalizeWin(io, finalState);

        if (finalState.phase !== 'FINISHED') {
          updateRoom(finalState);
          io.to(roomId).emit('state_update', sanitize(finalState));
          scheduleBotTurnIfNeeded(io, roomId);
        }
      } catch (err) {
        console.error('[bot move error]', err);
      }
    }, 700);

    botActionTimeouts.set(roomId, timer);
  }
}

export function registerHandlers(io: Server, socket: Socket): void {

  // ── create_room ────────────────────────────────────────────────────────────
  socket.on('create_room', (_, callback) => {
    const room = createRoom();
    callback?.({ roomId: room.roomId });
  });

  // ── add_bot ────────────────────────────────────────────────────────────────
  socket.on('add_bot', ({ roomId }: { roomId: string }, callback) => {
    const result = addBot(roomId);
    if (isGameError(result)) {
      socket.emit('error', result);
      return callback?.({ error: result });
    }
    io.to(roomId).emit('player_connected', { playerId: result.player.playerId, slot: result.player.slot });
    io.to(roomId).emit('state_update', sanitize(result.room));
    callback?.({ player: result.player });
  });

  // ── remove_bot ─────────────────────────────────────────────────────────────
  socket.on('remove_bot', ({ roomId, botId }: { roomId: string; botId?: string }, callback) => {
    const result = removeBot(roomId, botId);
    if (isGameError(result)) {
      socket.emit('error', result);
      return callback?.({ error: result });
    }
    io.to(roomId).emit('state_update', sanitize(result));
    callback?.({ ok: true });
  });

  // ── delete_room ────────────────────────────────────────────────────────────
  socket.on('delete_room', ({ roomId }: { roomId: string }, callback) => {
    const timer = botActionTimeouts.get(roomId);
    if (timer) {
      clearTimeout(timer);
      botActionTimeouts.delete(roomId);
    }
    io.to(roomId).emit('room_deleted', { roomId });
    deleteRoom(roomId);
    callback?.({ ok: true });
  });

  // ── join_room ──────────────────────────────────────────────────────────────
  // Handles both new joins and reconnects (distinguished by sessionToken presence)
  socket.on('join_room', ({ roomId, sessionToken }: { roomId: string; sessionToken?: string }, callback) => {
    if (!roomId) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'roomId required' });
      return callback?.({ error: 'roomId required' });
    }

    const result = joinRoom(roomId, sessionToken);

    if (isGameError(result)) {
      socket.emit('error', result);
      return callback?.({ error: result });
    }

    const prevMeta = socketMeta.get(socket.id);
    if (prevMeta && prevMeta.roomId !== roomId) {
      socket.leave(prevMeta.roomId);
    }

    socket.join(roomId);
    socketMeta.set(socket.id, { roomId, sessionToken: result.sessionToken });

    if (result.isReconnect) {
      // Reconnect: resync full state to this socket only
      const reconnected = reconnectPlayer(roomId, result.sessionToken);
      if (isGameError(reconnected)) {
        socket.emit('error', reconnected);
        return callback?.({ error: reconnected });
      }
      socket.emit('state_sync', sanitize(reconnected));
      socket.to(roomId).emit('player_reconnected', {
        playerId: result.sessionToken,
        slot: result.slot,
      });
      return callback?.({ sessionToken: result.sessionToken, slot: result.slot, color: result.color, isReconnect: true });
    }

    // New join
    const room = getRoom(roomId)!;
    socket.to(roomId).emit('player_connected', { playerId: result.sessionToken, slot: result.slot });
    io.to(roomId).emit('state_update', sanitize(room));

    callback?.({
      sessionToken: result.sessionToken,
      slot: result.slot,
      color: result.color,
      isReconnect: false,
    });
  });

  // ── start_game ─────────────────────────────────────────────────────────────
  socket.on('start_game', ({ roomId, sessionToken }: { roomId: string; sessionToken: string }, callback) => {
    const result = startGame(roomId);
    if (isGameError(result)) {
      socket.emit('error', result);
      return callback?.({ error: result });
    }
    io.to(roomId).emit('game_started', sanitize(result));
    scheduleBotTurnIfNeeded(io, roomId);
    callback?.({ ok: true });
  });

  // ── roll_dice ──────────────────────────────────────────────────────────────
  socket.on('roll_dice', ({ roomId, sessionToken }: { roomId: string; sessionToken: string }, callback) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return callback?.({ error: 'ROOM_NOT_FOUND' });
    }

    // Validate it's this player's turn
    const turn = room.turn;
    if (!turn || turn.phase !== 'AWAITING_ROLL') {
      socket.emit('error', { code: 'INVALID_PHASE', message: 'Not time to roll' });
      return callback?.({ error: 'INVALID_PHASE' });
    }

    const currentPlayer = room.players[turn.currentPlayerSlot];
    if (!currentPlayer || currentPlayer.playerId !== sessionToken) {
      socket.emit('error', { code: 'NOT_YOUR_TURN', message: 'Not your turn to roll' });
      return callback?.({ error: 'NOT_YOUR_TURN' });
    }

    // Roll dice (server-side, authoritative)
    let newState: RoomState;
    try {
      newState = processDiceRoll(room);
    } catch (err) {
      socket.emit('error', { code: err, message: String(err) });
      return callback?.({ error: err });
    }

    updateRoom(newState);

    // Broadcast dice result + valid moves to all clients in room
    io.to(roomId).emit('dice_rolled', {
      diceValue: newState.turn!.diceValue,
      validMoves: newState.turn!.validMoves,
      currentPlayerSlot: newState.turn!.currentPlayerSlot,
      consecutiveSixes: newState.turn!.consecutiveSixes,
    });

    // If TURN_COMPLETE already (no moves possible or three sixes), auto-advance
    if (newState.turn!.phase === 'TURN_COMPLETE') {
      const advanced = advanceTurn(newState);
      updateRoom(advanced);
      io.to(roomId).emit('state_update', sanitize(advanced));
      scheduleBotTurnIfNeeded(io, roomId);
    }

    callback?.({ ok: true });
  });

  // ── move_token ─────────────────────────────────────────────────────────────
  socket.on('move_token', ({ roomId, sessionToken, tokenId }: { roomId: string; sessionToken: string; tokenId: TokenId }, callback) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      return callback?.({ error: 'ROOM_NOT_FOUND' });
    }

    // Server re-validates everything — client cannot dictate outcomes
    let newState: RoomState;
    try {
      newState = applyMove(room, sessionToken, tokenId);
    } catch (err) {
      // err is an ErrorCode string (e.g. 'NOT_YOUR_TURN', 'INVALID_MOVE')
      socket.emit('error', { code: err, message: String(err) });
      return callback?.({ error: err });
    }

    // Advance turn
    let finalState = advanceTurn(newState);

    // Check for win
    finalState = checkAndFinalizeWin(io, finalState);

    if (finalState.phase !== 'FINISHED') {
      updateRoom(finalState);
      io.to(roomId).emit('state_update', sanitize(finalState));
      scheduleBotTurnIfNeeded(io, roomId);
    }

    callback?.({ ok: true });
  });

  // ── leave_room (voluntary) ─────────────────────────────────────────────────
  // Voluntary leave = immediate forfeit, no grace period
  socket.on('leave_room', ({ roomId, sessionToken }: { roomId: string; sessionToken: string }) => {
    handlePlayerLeave(io, socket, roomId, sessionToken, true);
    socket.leave(roomId);
    socketMeta.delete(socket.id);
  });

  // ── disconnect (passive) ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;
    socketMeta.delete(socket.id);
    handlePlayerLeave(io, socket, meta.roomId, meta.sessionToken, false);
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function handlePlayerLeave(
  io: Server,
  socket: Socket,
  roomId: RoomId,
  sessionToken: PlayerId,
  isVoluntary: boolean
): void {
  const room = getRoom(roomId);
  if (!room || room.phase === 'FINISHED') return;

  if (isVoluntary) {
    // Immediate forfeit
    const result = forfeitPlayer(roomId, sessionToken);
    if (!result) return;
    io.to(roomId).emit('player_forfeited', { playerId: sessionToken });
    const finalState = checkAndFinalizeWin(io, result.state);
    if (finalState.phase !== 'FINISHED') {
      io.to(roomId).emit('state_update', sanitize(finalState));
      scheduleBotTurnIfNeeded(io, roomId);
    }
  } else {
    // Passive disconnect: start 60s timer
    const updated = disconnectPlayer(
      roomId,
      sessionToken,
      (rId, sToken) => {
        // Called after 60s timeout with no reconnect
        const result = forfeitPlayer(rId, sToken);
        if (!result) return;
        io.to(rId).emit('player_forfeited', { playerId: sToken });
        const finalState = checkAndFinalizeWin(io, result.state);
        if (finalState.phase !== 'FINISHED') {
          updateRoom(finalState);
          io.to(rId).emit('state_update', sanitize(finalState));
          scheduleBotTurnIfNeeded(io, rId);
        }
      },
      60_000
    );
    if (!updated) return;
    io.to(roomId).emit('player_disconnected', {
      playerId: sessionToken,
      slot: room.players.find(p => p.playerId === sessionToken)?.slot,
      reconnectWindowMs: 60_000,
    });
    io.to(roomId).emit('state_update', sanitize(updated));
  }
}
