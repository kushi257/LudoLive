import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { RoomState, PlayerId, RoomId, TokenId, JoinResult } from '../types';

const SERVER_URL = 'http://localhost:3001';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface UseSocketOptions {
  roomId: RoomId | null;
  sessionToken: PlayerId | null;
  onStateUpdate: (state: RoomState) => void;
  onJoined: (result: JoinResult) => void;
  onGameStarted: (state: RoomState) => void;
  onGameOver: (data: { winnerId: PlayerId; winnerSlot: number; state: RoomState }) => void;
  onPlayerDisconnected: (data: { playerId: PlayerId; slot: number; reconnectWindowMs: number }) => void;
  onPlayerReconnected: (data: { playerId: PlayerId; slot: number }) => void;
  onPlayerForfeited: (data: { playerId: PlayerId }) => void;
  onRoomDeleted?: (data: { roomId: RoomId }) => void;
  onError: (err: { code: string; message: string }) => void;
  onDiceRolled: (data: { diceValue: number; validMoves: any[]; currentPlayerSlot: number }) => void;
}

export function useSocket(options: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const socket = io(SERVER_URL, {
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      // If we have a session, auto-rejoin on reconnect
      const { roomId, sessionToken } = optionsRef.current;
      if (roomId && sessionToken) {
        socket.emit('join_room', { roomId, sessionToken }, (result: any) => {
          if (result?.error) return;
          if (result?.isReconnect) {
            // state_sync event will fire separately with full state
          }
        });
      }
    });

    socket.on('disconnect', () => setConnectionStatus('reconnecting'));
    socket.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
    socket.on('reconnect_failed', () => setConnectionStatus('disconnected'));

    socket.on('state_sync', (state: RoomState) => optionsRef.current.onStateUpdate(state));
    socket.on('state_update', (state: RoomState) => optionsRef.current.onStateUpdate(state));
    socket.on('game_started', (state: RoomState) => optionsRef.current.onGameStarted(state));
    socket.on('game_over', (data: any) => optionsRef.current.onGameOver(data));
    socket.on('dice_rolled', (data: any) => optionsRef.current.onDiceRolled(data));
    socket.on('player_disconnected', (data: any) => optionsRef.current.onPlayerDisconnected(data));
    socket.on('player_reconnected', (data: any) => optionsRef.current.onPlayerReconnected(data));
    socket.on('player_forfeited', (data: any) => optionsRef.current.onPlayerForfeited(data));
    socket.on('room_deleted', (data: any) => optionsRef.current.onRoomDeleted?.(data));
    socket.on('player_connected', () => {}); // state_update handles UI refresh
    socket.on('error', (err: any) => optionsRef.current.onError(err));

    return () => {
      socket.disconnect();
    };
  }, []); // Only connect once

  const createRoom = useCallback(async (botCount = 0): Promise<string | null> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botCount }),
      });
      const data = await res.json();
      return data.roomId ?? null;
    } catch { return null; }
  }, []);

  const joinRoom = useCallback((roomId: RoomId, sessionToken?: PlayerId) => {
    socketRef.current?.emit('join_room', { roomId, sessionToken }, (result: JoinResult & { error?: any }) => {
      if (result && !result.error) {
        optionsRef.current.onJoined(result);
      }
    });
  }, []);

  const addBot = useCallback((roomId: RoomId) => {
    socketRef.current?.emit('add_bot', { roomId });
  }, []);

  const removeBot = useCallback((roomId: RoomId, botId?: string) => {
    socketRef.current?.emit('remove_bot', { roomId, botId });
  }, []);

  const deleteRoom = useCallback((roomId: RoomId) => {
    socketRef.current?.emit('delete_room', { roomId });
  }, []);

  const startGame = useCallback((roomId: RoomId, sessionToken: PlayerId) => {
    socketRef.current?.emit('start_game', { roomId, sessionToken });
  }, []);

  const rollDice = useCallback((roomId: RoomId, sessionToken: PlayerId) => {
    socketRef.current?.emit('roll_dice', { roomId, sessionToken });
  }, []);

  const moveToken = useCallback((roomId: RoomId, sessionToken: PlayerId, tokenId: TokenId) => {
    socketRef.current?.emit('move_token', { roomId, sessionToken, tokenId });
  }, []);

  const leaveRoom = useCallback((roomId: RoomId, sessionToken: PlayerId) => {
    socketRef.current?.emit('leave_room', { roomId, sessionToken });
  }, []);

  return { connectionStatus, createRoom, joinRoom, addBot, removeBot, deleteRoom, startGame, rollDice, moveToken, leaveRoom };
}
