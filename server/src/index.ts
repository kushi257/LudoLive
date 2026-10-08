import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerHandlers } from './socket/handlers';
import { createRoom, listRoomIds, getRoom, addBot, deleteRoom } from './rooms/RoomManager';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// ── REST endpoints (lobby only) ───────────────────────────────────────────────

// Create a new room (optionally with bots)
app.post('/api/rooms', (req, res) => {
  const room = createRoom();
  const botCount = req.body?.botCount;
  if (typeof botCount === 'number' && botCount > 0) {
    for (let i = 0; i < Math.min(botCount, 3); i++) {
      addBot(room.roomId);
    }
  }
  res.json({ roomId: room.roomId });
});

// List open rooms (WAITING phase)
app.get('/api/rooms', (_, res) => {
  const ids = listRoomIds();
  const open = ids
    .map(id => getRoom(id))
    .filter(r => r && r.phase === 'WAITING')
    .map(r => ({ roomId: r!.roomId, playerCount: r!.players.length }));
  res.json(open);
});

// Get single room state (for initial page load / deep link)
app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

// Delete a room
app.delete('/api/rooms/:roomId', (req, res) => {
  const deleted = deleteRoom(req.params.roomId);
  if (!deleted) return res.status(404).json({ error: 'Room not found' });
  res.json({ ok: true });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // socket.io built-in reconnection is disabled server-side;
  // clients handle reconnect via our session-token flow
  connectionStateRecovery: {},
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerHandlers(io, socket);
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} — ${reason}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Ludo server running on http://localhost:${PORT}`);
});
