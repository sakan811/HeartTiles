import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("join-room", ({ roomCode, playerName }) => {
      const room = rooms.get(roomCode.toUpperCase());

      if (!room) {
        // Create new room if it doesn't exist
        const newRoom = {
          code: roomCode.toUpperCase(),
          players: [],
          maxPlayers: 4,
        };
        rooms.set(roomCode.toUpperCase(), newRoom);

        // Add player to new room
        const player = {
          id: socket.id,
          name: playerName || `Player ${newRoom.players.length + 1}`,
        };
        newRoom.players.push(player);

        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();
        socket.data.playerName = player.name;

        console.log(`Room ${roomCode.toUpperCase()} created by ${socket.id}`);
        io.to(socket.id).emit("room-joined", { players: newRoom.players });
      } else if (room.players.length >= room.maxPlayers) {
        // Room is full
        socket.emit("room-error", "Room is full");
      } else {
        // Add player to existing room
        const player = {
          id: socket.id,
          name: playerName || `Player ${room.players.length + 1}`,
        };
        room.players.push(player);

        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();
        socket.data.playerName = player.name;

        console.log(`Player ${socket.id} joined room ${roomCode.toUpperCase()}`);

        // Notify all players in the room
        io.to(roomCode.toUpperCase()).emit("room-joined", { players: room.players });
        io.to(roomCode.toUpperCase()).emit("player-joined", { players: room.players });
      }
    });

    socket.on("leave-room", ({ roomCode }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room) {
        // Remove player from room
        room.players = room.players.filter(player => player.id !== socket.id);

        // Notify remaining players
        io.to(roomCode.toUpperCase()).emit("player-left", { players: room.players });

        // Delete room if empty
        if (room.players.length === 0) {
          rooms.delete(roomCode.toUpperCase());
          console.log(`Room ${roomCode.toUpperCase()} deleted (empty)`);
        } else {
          console.log(`Player ${socket.id} left room ${roomCode.toUpperCase()}`);
        }

        socket.leave(roomCode.toUpperCase());
        socket.data.roomCode = null;
        socket.data.playerName = null;
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);

      const roomCode = socket.data.roomCode;
      if (roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          // Remove player from room
          room.players = room.players.filter(player => player.id !== socket.id);

          // Notify remaining players
          io.to(roomCode).emit("player-left", { players: room.players });

          // Delete room if empty
          if (room.players.length === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted (empty)`);
          }
        }
      }
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});