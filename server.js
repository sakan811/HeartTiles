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

  // Helper function to generate random tiles
  function generateTiles() {
    const colors = ["red", "yellow", "green", "blue", "brown"];
    const emojis = ["🟥", "🟨", "🟩", "🟦", "🟫"];
    const tiles = [];

    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * colors.length);
      tiles.push({
        id: i,
        color: colors[randomIndex],
        emoji: emojis[randomIndex]
      });
    }
    return tiles;
  }

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("join-room", ({ roomCode, playerName }) => {
      const room = rooms.get(roomCode.toUpperCase());

      if (!room) {
        // Create new room if it doesn't exist
        const newRoom = {
          code: roomCode.toUpperCase(),
          players: [],
          maxPlayers: 2,
          gameState: {
            tiles: [],
            gameStarted: false
          }
        };
        rooms.set(roomCode.toUpperCase(), newRoom);

        // Add player to new room
        const player = {
          id: socket.id,
          name: playerName || `Player ${newRoom.players.length + 1}`,
          isReady: false,
        };
        // Ensure no duplicate players
        if (!newRoom.players.find(p => p.id === socket.id)) {
          newRoom.players.push(player);
        }

        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();
        socket.data.playerName = player.name;

        console.log(`Room ${roomCode.toUpperCase()} created by ${socket.id}`);
        io.to(socket.id).emit("room-joined", { players: newRoom.players, playerId: socket.id });
      } else if (room.players.length >= room.maxPlayers) {
        // Room is full
        socket.emit("room-error", "Room is full");
      } else {
        // Add player to existing room
        const player = {
          id: socket.id,
          name: playerName || `Player ${room.players.length + 1}`,
          isReady: false,
        };
        // Ensure no duplicate players
        if (!room.players.find(p => p.id === socket.id)) {
          room.players.push(player);
        }

        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();
        socket.data.playerName = player.name;

        console.log(`Player ${socket.id} joined room ${roomCode.toUpperCase()}`);

        // Notify all players in the room
        io.to(socket.id).emit("room-joined", { players: room.players, playerId: socket.id });
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

    socket.on("player-ready", ({ roomCode }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.isReady = !player.isReady;
          console.log(`Player ${socket.id} ready status: ${player.isReady}`);

          // Notify all players in the room
          io.to(roomCode.toUpperCase()).emit("player-ready", { players: room.players });

          // Check if all players are ready (exactly 2 players required)
          if (room.players.length === 2 && room.players.every(p => p.isReady)) {
            console.log(`All players ready in room ${roomCode.toUpperCase()}, starting game!`);

            // Generate initial tile state
            room.gameState.tiles = generateTiles();
            room.gameState.gameStarted = true;

            io.to(roomCode.toUpperCase()).emit("game-start", { tiles: room.gameState.tiles });
          }
        }
      }
    });

    socket.on("shuffle-tiles", ({ roomCode }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room && room.gameState.gameStarted) {
        // Generate new tiles for all players
        room.gameState.tiles = generateTiles();
        console.log(`Tiles shuffled in room ${roomCode.toUpperCase()}`);

        // Broadcast new tile state to all players
        io.to(roomCode.toUpperCase()).emit("tiles-updated", { tiles: room.gameState.tiles });
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