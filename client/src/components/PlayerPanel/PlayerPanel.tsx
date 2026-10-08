import { useEffect, useState } from 'react';
import type { PlayerState, PlayerId } from '../../types';
import { COLOR_MAP } from '../Board/Board';
import type { DisconnectNotice } from '../../hooks/useGameState';

interface PlayerPanelProps {
  players: PlayerState[];
  currentPlayerSlot: number | null;
  mySlot: number;
  disconnectedOpponents: Map<PlayerId, DisconnectNotice>;
  winner: PlayerId | null;
}

export function PlayerPanel({ players, currentPlayerSlot, mySlot, disconnectedOpponents, winner }: PlayerPanelProps) {
  return (
    <div className="player-panel">
      {players.map(player => {
        const isActive = player.slot === currentPlayerSlot;
        const isMe = player.slot === mySlot;
        const disconnectNotice = disconnectedOpponents.get(player.playerId);
        const isWinner = winner === player.playerId;
        const finishedCount = player.tokens.filter(t => t.position.zone === 'FINISHED').length;

        const displayName = player.name
          ? player.name
          : isMe
            ? `${player.color} (You)`
            : player.isBot
              ? `${player.color} Bot`
              : player.color;

        return (
          <div
            key={player.slot}
            className={`player-card ${isActive ? 'active' : ''} ${player.status === 'FORFEITED' ? 'forfeited' : ''} ${player.isBot ? 'bot-card' : ''}`}
            style={{ borderColor: COLOR_MAP[player.color] }}
          >
            <div className="player-card-header">
              <div className="player-color-dot" style={{ background: COLOR_MAP[player.color] }} />
              <div className="player-name-wrapper">
                <span className="player-name">
                  {displayName}
                  {isWinner && ' 🏆'}
                </span>
                {player.isBot && <span className="bot-pill">AI</span>}
                {isMe && !player.isBot && <span className="you-pill">You</span>}
              </div>
              <StatusBadge status={player.status} isBot={player.isBot} />
            </div>

            <div className="token-progress">
              {player.tokens.map(token => (
                <div
                  key={token.tokenId}
                  className={`token-dot ${token.position.zone === 'FINISHED' ? 'done' : token.position.zone === 'HOME' ? 'home' : 'active'}`}
                  style={{ background: token.position.zone === 'FINISHED' ? '#ffd700' : COLOR_MAP[player.color] }}
                />
              ))}
              <span className="finish-count">{finishedCount}/4</span>
            </div>

            {disconnectNotice && player.status === 'DISCONNECTED' && (
              <DisconnectTimer notice={disconnectNotice} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, isBot }: { status: PlayerState['status']; isBot?: boolean }) {
  if (isBot) return <span className="status-badge" title="AI Bot">🤖</span>;

  const labels: Record<string, string> = {
    CONNECTED: '🟢',
    DISCONNECTED: '🟡',
    FORFEITED: '💀',
    FINISHED: '🏁',
  };
  return <span className="status-badge">{labels[status] ?? '⚪'}</span>;
}

function DisconnectTimer({ notice }: { notice: DisconnectNotice }) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const elapsed = Date.now() - notice.startedAt;
      const remaining = Math.max(0, Math.ceil((notice.reconnectWindowMs - elapsed) / 1000));
      setSecondsLeft(remaining);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [notice]);

  return (
    <div className="disconnect-timer">
      ⏳ Reconnecting… {secondsLeft}s
    </div>
  );
}
