import { useState, useEffect } from 'react';

interface LobbyProps {
  onCreateRoom: (botCount?: number) => Promise<string | null>;
  onJoinRoom: (roomId: string) => void;
}

const SERVER_URL = 'http://localhost:3001';

interface OpenRoom { roomId: string; playerCount: number; }

export function Lobby({ onCreateRoom, onJoinRoom }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadRooms = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`);
      const data = await res.json();
      setOpenRooms(data);
    } catch { /* server offline */ }
  };

  useEffect(() => {
    loadRooms();
    const id = setInterval(loadRooms, 3000);
    return () => clearInterval(id);
  }, []);

  const handleCreate = async (botCount = 0) => {
    setCreating(true);
    setError('');
    const roomId = await onCreateRoom(botCount);
    setCreating(false);
    if (roomId) {
      window.location.hash = roomId;
      onJoinRoom(roomId);
    } else {
      setError('Could not reach the server. Is the backend running on http://localhost:3001?');
    }
  };

  const handleJoin = () => {
    let id = joinCode.trim();
    if (!id) { setError('Enter a room code or link'); return; }
    // If user pasted a full URL (e.g. http://localhost:5173/#roomId)
    if (id.includes('#')) {
      id = id.split('#')[1];
    }
    window.location.hash = id;
    onJoinRoom(id);
  };

  const handleCopyRoomLink = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedRoomId(roomId);
    setTimeout(() => setCopiedRoomId(null), 2500);
  };

  const handleDeleteOpenRoom = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    try {
      await fetch(`${SERVER_URL}/api/rooms/${roomId}`, { method: 'DELETE' });
      loadRooms();
    } catch (err) {
      console.error('Failed to delete room:', err);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-hero">
        <h1 className="lobby-title">🎲 LudoLive</h1>
        <p className="lobby-subtitle">Real-time multiplayer & solo AI Ludo · 2–4 players</p>
      </div>

      <div className="lobby-cards">
        <div className="lobby-card solo-card">
          <div className="card-badge">Single Player</div>
          <h2>🤖 Play vs Bots</h2>
          <p>Jump right into a solo match against 3 smart AI bots — no waiting required!</p>
          <button
            id="play-bots-btn"
            className="btn-primary btn-accent"
            onClick={() => handleCreate(3)}
            disabled={creating}
          >
            {creating ? 'Creating…' : '⚡ Quick Play vs Bots'}
          </button>
        </div>

        <div className="lobby-card">
          <div className="card-badge">Multiplayer</div>
          <h2>Create Room</h2>
          <p>Start a custom game, invite friends with a link, or add bots as needed.</p>
          <button
            id="create-room-btn"
            className="btn-primary"
            onClick={() => handleCreate(0)}
            disabled={creating}
          >
            {creating ? 'Creating…' : '+ New Room'}
          </button>
        </div>

        <div className="lobby-card">
          <div className="card-badge">Join</div>
          <h2>Join Room</h2>
          <p>Enter a room code or paste an invite link to join.</p>
          <div className="join-row">
            <input
              id="join-room-input"
              className="join-input"
              placeholder="Room code or full URL link…"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button id="join-room-btn" className="btn-secondary" onClick={handleJoin}>
              Join →
            </button>
          </div>
        </div>
      </div>

      {error && <div className="lobby-error">{error}</div>}

      {openRooms.length > 0 && (
        <div className="open-rooms">
          <div className="open-rooms-header">
            <h3>Open Rooms ({openRooms.length})</h3>
            <span className="open-rooms-hint">Click a room to join, or copy its link</span>
          </div>
          <div className="rooms-grid">
            {openRooms.map(r => (
              <div
                key={r.roomId}
                className="room-chip"
                onClick={() => { window.location.hash = r.roomId; onJoinRoom(r.roomId); }}
              >
                <div className="room-chip-main">
                  <span className="room-id">{r.roomId.slice(0, 8)}…</span>
                  <span className="room-count">👥 {r.playerCount}/4</span>
                </div>
                <div className="room-chip-actions">
                  <button
                    className="chip-action-btn"
                    title="Copy direct join link"
                    onClick={(e) => handleCopyRoomLink(e, r.roomId)}
                  >
                    {copiedRoomId === r.roomId ? '✓ Copied!' : '📋 Link'}
                  </button>
                  <button
                    className="chip-action-btn delete-action-btn"
                    title="Delete room"
                    onClick={(e) => handleDeleteOpenRoom(e, r.roomId)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
