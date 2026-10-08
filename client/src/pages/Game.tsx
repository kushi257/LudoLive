import { useState, useCallback } from 'react';
import type { RoomState, PlayerId } from '../types';
import { Board } from '../components/Board/Board';
import { Dice } from '../components/Dice/Dice';
import { PlayerPanel } from '../components/PlayerPanel/PlayerPanel';
import { ConnectionBanner } from '../components/ConnectionBanner/ConnectionBanner';
import type { DisconnectNotice, Session } from '../hooks/useGameState';
import { COLOR_MAP } from '../components/Board/Board';

interface GameProps {
  roomId: string;
  session: Session | null;
  roomState: RoomState | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  disconnectedOpponents: Map<PlayerId, DisconnectNotice>;
  gameOver: { winnerId: PlayerId; winnerSlot: number } | null;
  isMyTurn: boolean;
  movableTokenIds: Set<number>;
  onRollDice: () => void;
  onMoveToken: (tokenId: number) => void;
  onStartGame: () => void;
  onAddBot: () => void;
  onRemoveBot: (botId?: string) => void;
  onDeleteRoom: () => void;
  onLeave: () => void;
}

export function Game({
  roomId, session, roomState, connectionStatus, disconnectedOpponents,
  gameOver, isMyTurn, movableTokenIds, onRollDice, onMoveToken, onStartGame,
  onAddBot, onRemoveBot, onDeleteRoom, onLeave,
}: GameProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleRoll = useCallback(() => {
    setIsRolling(true);
    setTimeout(() => setIsRolling(false), 600);
    onRollDice();
  }, [onRollDice]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }, [roomId]);

  if (!roomState) {
    return (
      <div className="game-loading">
        <ConnectionBanner status={connectionStatus} />
        <div className="spinner" />
        <p>Joining room <code>{roomId.slice(0, 8)}…</code></p>
        <p className="hint">Share this URL with friends to invite them.</p>
        <button className="btn-primary" onClick={handleCopyLink}>
          {copiedLink ? '✓ Link Copied!' : '📋 Copy Invite Link'}
        </button>
      </div>
    );
  }

  const turn = roomState.turn;
  const mySlot = session?.slot ?? -1;
  const canRoll = isMyTurn && turn?.phase === 'AWAITING_ROLL';
  const currentPlayer = turn !== null ? roomState.players[turn.currentPlayerSlot] : null;
  const currentColor = currentPlayer?.color ?? null;
  const hasBots = roomState.players.some(p => p.isBot);

  const handleQuickFillBotsAndStart = () => {
    // Add bots until 4 players then start
    const needed = 4 - roomState.players.length;
    for (let i = 0; i < needed; i++) {
      onAddBot();
    }
    setTimeout(() => {
      onStartGame();
    }, 400);
  };

  return (
    <div className="game-layout">
      <ConnectionBanner status={connectionStatus} />

      {/* Left sidebar: Player info */}
      <aside className="game-sidebar">
        <div className="room-info-card">
          <div className="room-info-header">
            <span className="room-label">Room Code</span>
            <span className="room-id-tag">{roomId.slice(0, 8)}…</span>
          </div>
          <button
            className={`btn-copy-link ${copiedLink ? 'copied' : ''}`}
            onClick={handleCopyLink}
            title="Click to copy full join link"
          >
            {copiedLink ? '✓ Copied to Clipboard!' : '📋 Copy Invite Link'}
          </button>
        </div>

        <PlayerPanel
          players={roomState.players}
          currentPlayerSlot={turn?.currentPlayerSlot ?? null}
          mySlot={mySlot}
          disconnectedOpponents={disconnectedOpponents}
          winner={roomState.winner}
        />

        {/* Waiting room / start button */}
        {roomState.phase === 'WAITING' && (
          <div className="waiting-room">
            <p className="waiting-count">👥 {roomState.players.length}/4 players ready</p>

            <div className="bot-controls">
              {roomState.players.length < 4 && (
                <button id="add-bot-btn" className="btn-secondary btn-sm" onClick={onAddBot}>
                  🤖 + Add Bot
                </button>
              )}
              {hasBots && (
                <button id="remove-bot-btn" className="btn-ghost btn-sm" onClick={() => onRemoveBot()}>
                  ✕ Remove Bot
                </button>
              )}
            </div>

            {roomState.players.length >= 2 && (
              <button id="start-game-btn" className="btn-primary start-btn" onClick={onStartGame}>
                🚀 Start Game ({roomState.players.length} Players)
              </button>
            )}

            {roomState.players.length < 2 && (
              <div className="solo-prompt">
                <p className="hint">Waiting for friends? Or start solo with AI:</p>
                <button className="btn-primary btn-accent" onClick={handleQuickFillBotsAndStart}>
                  ⚡ Fill with 3 Bots & Start
                </button>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-bottom-actions">
          <button className="btn-ghost leave-btn" onClick={onLeave} title="Leave room and return to lobby">
            🚪 Leave Room
          </button>
          <button
            className="btn-danger-ghost delete-room-btn"
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this room for everyone?')) {
                onDeleteRoom();
              }
            }}
            title="Delete room entirely"
          >
            🗑️ Delete Room
          </button>
        </div>
      </aside>

      {/* Main board area */}
      <main className="game-main">
        {roomState.phase === 'IN_PROGRESS' && (
          <div className="turn-indicator" style={{ borderColor: currentColor ? COLOR_MAP[currentColor] : 'transparent' }}>
            {isMyTurn
              ? `🎯 Your turn! ${turn?.phase === 'AWAITING_MOVE' ? 'Choose a token to move.' : 'Roll the dice.'}`
              : currentPlayer?.isBot
                ? `🤖 ${currentPlayer.name || currentPlayer.color + ' Bot'}'s turn...`
                : `${currentColor}'s turn`}
          </div>
        )}

        <Board
          players={roomState.players}
          movableTokenIds={movableTokenIds}
          mySlot={mySlot}
          onTokenClick={onMoveToken}
        />

        {roomState.phase === 'IN_PROGRESS' && (
          <div className="dice-area">
            <Dice
              value={turn?.diceValue ?? null}
              isRolling={isRolling}
              canRoll={canRoll}
              onRoll={handleRoll}
            />
            {turn?.consecutiveSixes && turn.consecutiveSixes > 0 ? (
              <div className="sixes-indicator">
                🔥 {turn.consecutiveSixes} six{turn.consecutiveSixes > 1 ? 'es' : ''} in a row!
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Victory overlay */}
      {gameOver && (
        <VictoryOverlay
          winnerId={gameOver.winnerId}
          winnerSlot={gameOver.winnerSlot}
          players={roomState.players}
          isMe={gameOver.winnerId === session?.sessionToken}
          onPlayAgain={onLeave}
        />
      )}
    </div>
  );
}

interface VictoryOverlayProps {
  winnerId: PlayerId;
  winnerSlot: number;
  players: RoomState['players'];
  isMe: boolean;
  onPlayAgain: () => void;
}

function VictoryOverlay({ winnerId, players, isMe, onPlayAgain }: VictoryOverlayProps) {
  const winner = players.find(p => p.playerId === winnerId);
  const winnerTitle = isMe
    ? 'You Win!'
    : winner?.isBot
      ? `🤖 ${winner.name || winner.color + ' Bot'} Wins!`
      : `${winner?.color ?? 'Player'} Wins!`;

  return (
    <div className="victory-overlay">
      <div className="victory-card">
        <div className="victory-emoji">{isMe ? '🥇' : '🏆'}</div>
        <h2 className="victory-title">{winnerTitle}</h2>
        <p className="victory-sub">
          {isMe ? 'Amazing! All your tokens made it home.' : `${winner?.color} got all 4 tokens home first.`}
        </p>
        <button id="play-again-btn" className="btn-primary" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
