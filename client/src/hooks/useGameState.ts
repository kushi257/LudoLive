import { useState, useCallback, useEffect } from 'react';
import type { RoomState, PlayerId, RoomId, Color, ValidMove } from '../types';

const SESSION_KEY_PREFIX = 'ludo_session_';

export interface Session {
  sessionToken: PlayerId;
  slot: number;
  color: Color;
  roomId: RoomId;
}

function loadSession(roomId: RoomId): Session | null {
  try {
    const raw = localStorage.getItem(`${SESSION_KEY_PREFIX}${roomId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(session: Session): void {
  localStorage.setItem(`${SESSION_KEY_PREFIX}${session.roomId}`, JSON.stringify(session));
}

function clearSession(roomId: RoomId): void {
  localStorage.removeItem(`${SESSION_KEY_PREFIX}${roomId}`);
}

export interface DisconnectNotice {
  playerId: PlayerId;
  slot: number;
  reconnectWindowMs: number;
  startedAt: number;
}

export function useGameState() {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [disconnectedOpponents, setDisconnectedOpponents] = useState<Map<PlayerId, DisconnectNotice>>(new Map());
  const [gameOver, setGameOver] = useState<{ winnerId: PlayerId; winnerSlot: number } | null>(null);

  // On mount, check localStorage for existing sessions
  // (roomId is determined from URL hash)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const existing = loadSession(hash);
      if (existing) setSession(existing);
    }
  }, []);

  const handleStateUpdate = useCallback((state: RoomState) => {
    setRoomState(state);
    if (state.phase !== 'FINISHED') {
      setGameOver(null);
    } else if (state.winner) {
      const winnerPlayer = state.players.find(p => p.playerId === state.winner);
      setGameOver({ winnerId: state.winner, winnerSlot: winnerPlayer?.slot ?? -1 });
    }
  }, []);

  const handleJoined = useCallback((result: { sessionToken: PlayerId; slot: number; color: Color; isReconnect: boolean }, roomId: RoomId) => {
    const sess: Session = { sessionToken: result.sessionToken, slot: result.slot, color: result.color, roomId };
    setSession(sess);
    saveSession(sess);
    setGameOver(null);
  }, []);

  const handleGameOver = useCallback((data: { winnerId: PlayerId; winnerSlot: number; state: RoomState }) => {
    setRoomState(data.state);
    setGameOver({ winnerId: data.winnerId, winnerSlot: data.winnerSlot });
  }, []);

  const handlePlayerDisconnected = useCallback((data: { playerId: PlayerId; slot: number; reconnectWindowMs: number }) => {
    setDisconnectedOpponents(prev => {
      const next = new Map(prev);
      next.set(data.playerId, { ...data, startedAt: Date.now() });
      return next;
    });
  }, []);

  const handlePlayerReconnected = useCallback((data: { playerId: PlayerId; slot: number }) => {
    setDisconnectedOpponents(prev => {
      const next = new Map(prev);
      next.delete(data.playerId);
      return next;
    });
  }, []);

  const handlePlayerForfeited = useCallback((data: { playerId: PlayerId }) => {
    setDisconnectedOpponents(prev => {
      const next = new Map(prev);
      next.delete(data.playerId);
      return next;
    });
  }, []);

  // Derived state
  const mySlot = session?.slot ?? -1;
  const currentTurn = roomState?.turn ?? null;
  const isMyTurn = currentTurn !== null && currentTurn.currentPlayerSlot === mySlot;
  const validMoves: ValidMove[] = isMyTurn ? (currentTurn?.validMoves ?? []) : [];
  const movableTokenIds = new Set(validMoves.map(m => m.tokenId));

  const resetGame = useCallback((roomId?: RoomId | null) => {
    if (roomId) {
      clearSession(roomId);
    }
    setSession(null);
    setRoomState(null);
    setGameOver(null);
    setDisconnectedOpponents(new Map());
  }, []);

  return {
    roomState,
    session,
    gameOver,
    disconnectedOpponents,
    isMyTurn,
    validMoves,
    movableTokenIds,
    handleStateUpdate,
    handleJoined,
    handleGameOver,
    handlePlayerDisconnected,
    handlePlayerReconnected,
    handlePlayerForfeited,
    resetGame,
    loadSession,
  };
}
