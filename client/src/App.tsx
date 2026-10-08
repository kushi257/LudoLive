import { useState, useCallback, useEffect } from 'react';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';
import { useSocket } from './hooks/useSocket';
import { useGameState } from './hooks/useGameState';
import type { RoomId, TokenId } from './types';

export default function App() {
  const [roomId, setRoomId] = useState<RoomId | null>(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || null;
  });
  const [notification, setNotification] = useState<string | null>(null);

  const {
    roomState, session, gameOver, disconnectedOpponents,
    isMyTurn, movableTokenIds,
    handleStateUpdate, handleJoined, handleGameOver,
    handlePlayerDisconnected, handlePlayerReconnected,
    handlePlayerForfeited, resetGame, loadSession,
  } = useGameState();

  const handleRoomDeleted = useCallback((data: { roomId: RoomId }) => {
    resetGame(data.roomId);
    window.location.hash = '';
    setRoomId(null);
    setNotification('This room has been deleted by the host.');
    setTimeout(() => setNotification(null), 5000);
  }, [resetGame]);

  const {
    connectionStatus, createRoom, joinRoom, addBot, removeBot, deleteRoom, startGame, rollDice, moveToken, leaveRoom,
  } = useSocket({
    roomId,
    sessionToken: session?.sessionToken ?? null,
    onStateUpdate: handleStateUpdate,
    onJoined: (result) => { if (roomId) handleJoined(result, roomId); },
    onGameStarted: handleStateUpdate,
    onGameOver: handleGameOver,
    onPlayerDisconnected: handlePlayerDisconnected,
    onPlayerReconnected: handlePlayerReconnected,
    onPlayerForfeited: handlePlayerForfeited,
    onRoomDeleted: handleRoomDeleted,
    onError: (err) => console.error('[game error]', err),
    onDiceRolled: (data) => {
      if (!roomState) return;
      handleStateUpdate({
        ...roomState,
        turn: {
          ...roomState.turn!,
          diceValue: data.diceValue,
          validMoves: data.validMoves,
          currentPlayerSlot: data.currentPlayerSlot,
          phase: (data.validMoves && data.validMoves.length > 0) ? 'AWAITING_MOVE' : 'TURN_COMPLETE',
        },
      });
    },
  });

  // Auto-join when socket connects or roomId changes
  useEffect(() => {
    if (roomId && connectionStatus === 'connected') {
      const existing = loadSession(roomId);
      joinRoom(roomId, existing?.sessionToken);
    } else if (!roomId) {
      resetGame();
    }
  }, [roomId, connectionStatus, joinRoom, loadSession, resetGame]);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '');
      setRoomId(h || null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleCreateRoom = useCallback(async (botCount = 0) => createRoom(botCount), [createRoom]);

  const handleJoinRoom = useCallback((id: RoomId) => {
    if (roomState && roomState.roomId !== id) {
      resetGame(roomState.roomId);
    }
    setRoomId(id);
  }, [roomState, resetGame]);

  const handleAddBot = useCallback(() => {
    if (!roomId) return;
    addBot(roomId);
  }, [roomId, addBot]);

  const handleRemoveBot = useCallback((botId?: string) => {
    if (!roomId) return;
    removeBot(roomId, botId);
  }, [roomId, removeBot]);

  const handleDeleteRoom = useCallback(() => {
    if (!roomId) return;
    deleteRoom(roomId);
    resetGame(roomId);
    window.location.hash = '';
    setRoomId(null);
  }, [roomId, deleteRoom, resetGame]);

  const handleRollDice = useCallback(() => {
    if (!roomId || !session) return;
    rollDice(roomId, session.sessionToken);
  }, [roomId, session, rollDice]);

  const handleMoveToken = useCallback((tokenId: number) => {
    if (!roomId || !session) return;
    moveToken(roomId, session.sessionToken, tokenId as TokenId);
  }, [roomId, session, moveToken]);

  const handleStartGame = useCallback(() => {
    if (!roomId || !session) return;
    startGame(roomId, session.sessionToken);
  }, [roomId, session, startGame]);

  const handleLeave = useCallback(() => {
    if (roomId && session) {
      leaveRoom(roomId, session.sessionToken);
      resetGame(roomId);
    }
    window.location.hash = '';
    setRoomId(null);
  }, [roomId, session, leaveRoom, resetGame]);

  if (!roomId) {
    return (
      <>
        {notification && <div className="global-toast">{notification}</div>}
        <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      </>
    );
  }

  return (
    <>
      {notification && <div className="global-toast">{notification}</div>}
      <Game
        roomId={roomId}
        session={session}
        roomState={roomState}
        connectionStatus={connectionStatus}
        disconnectedOpponents={disconnectedOpponents}
        gameOver={gameOver}
        isMyTurn={isMyTurn}
        movableTokenIds={movableTokenIds}
        onRollDice={handleRollDice}
        onMoveToken={handleMoveToken}
        onStartGame={handleStartGame}
        onAddBot={handleAddBot}
        onRemoveBot={handleRemoveBot}
        onDeleteRoom={handleDeleteRoom}
        onLeave={handleLeave}
      />
    </>
  );
}
