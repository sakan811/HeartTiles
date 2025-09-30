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

  // Helper function to generate a single heart card
  function generateSingleHeart() {
    const colors = ["red", "yellow", "green", "blue", "brown"];
    const heartEmojis = ["❤️", "💛", "💚", "💙", "🤎"];
    const randomIndex = Math.floor(Math.random() * colors.length);

    return {
      id: Date.now() + Math.random(), // Unique ID based on timestamp
      color: colors[randomIndex],
      emoji: heartEmojis[randomIndex]
    };
  }

  // Helper function to select random starting player
  function selectRandomStartingPlayer(players) {
    return players[Math.floor(Math.random() * players.length)];
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
            gameStarted: false,
            currentPlayer: null,
            deck: {
              emoji: "💌",
              cards: 10 // Initial deck size
            },
            playerHands: {},
            turnCount: 0
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

            // Initialize player hands with starting hearts
            room.players.forEach(player => {
              room.gameState.playerHands[player.id] = [];
              // Deal 3 starting hearts to each player
              for (let i = 0; i < 3; i++) {
                room.gameState.playerHands[player.id].push(generateSingleHeart());
              }
            });

            // Select random starting player
            room.gameState.currentPlayer = selectRandomStartingPlayer(room.players);
            room.gameState.turnCount = 1;

            // Include player hands in the player objects for easier client-side handling
            const playersWithHands = room.players.map(player => ({
              ...player,
              hand: room.gameState.playerHands[player.id] || []
            }));

            io.to(roomCode.toUpperCase()).emit("game-start", {
              tiles: room.gameState.tiles,
              currentPlayer: room.gameState.currentPlayer,
              players: playersWithHands,
              playerHands: room.gameState.playerHands,
              deck: room.gameState.deck,
              turnCount: room.gameState.turnCount
            });
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

    socket.on("draw-heart", ({ roomCode }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room && room.gameState.gameStarted && room.gameState.deck.cards > 0) {
        // Check if it's the current player's turn
        if (room.gameState.currentPlayer.id === socket.id) {
          // Generate a new heart and add to player's hand
          const newHeart = generateSingleHeart();

          // Add the heart to the current player's hand
          if (!room.gameState.playerHands[socket.id]) {
            room.gameState.playerHands[socket.id] = [];
          }
          room.gameState.playerHands[socket.id].push(newHeart);

          // Decrease deck count
          room.gameState.deck.cards--;

          console.log(`Heart drawn by ${socket.id} in room ${roomCode.toUpperCase()}, deck has ${room.gameState.deck.cards} cards left`);

          // Include player hands in the player objects for broadcasting
          const playersWithUpdatedHands = room.players.map(player => ({
            ...player,
            hand: room.gameState.playerHands[player.id] || []
          }));

          // Broadcast the updated player hands and deck to all players
          io.to(roomCode.toUpperCase()).emit("heart-drawn", {
            players: playersWithUpdatedHands,
            playerHands: room.gameState.playerHands,
            deck: room.gameState.deck
          });
        }
      }
    });

    socket.on("place-heart", ({ roomCode, tileId, heartId }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room && room.gameState.gameStarted) {
        // Check if it's the current player's turn
        if (room.gameState.currentPlayer.id === socket.id) {
          // Find the heart in player's hand
          const playerHand = room.gameState.playerHands[socket.id] || [];
          const heartIndex = playerHand.findIndex(heart => heart.id === heartId);

          if (heartIndex !== -1) {
            // Remove heart from player's hand
            const heart = playerHand.splice(heartIndex, 1)[0];

            // Place heart on the tile
            const tileIndex = room.gameState.tiles.findIndex(tile => tile.id === tileId);
            if (tileIndex !== -1) {
              room.gameState.tiles[tileIndex] = {
                ...room.gameState.tiles[tileIndex],
                emoji: heart.emoji,
                color: heart.color
              };

              console.log(`Heart placed on tile ${tileId} by ${socket.id} in room ${roomCode.toUpperCase()}`);

              // Include player hands in the player objects for broadcasting
              const playersWithUpdatedHands = room.players.map(player => ({
                ...player,
                hand: room.gameState.playerHands[player.id] || []
              }));

              // Broadcast the updated tiles and player hands
              io.to(roomCode.toUpperCase()).emit("heart-placed", {
                tiles: room.gameState.tiles,
                players: playersWithUpdatedHands,
                playerHands: room.gameState.playerHands
              });
            }
          }
        }
      }
    });

    socket.on("end-turn", ({ roomCode }) => {
      const room = rooms.get(roomCode.toUpperCase());
      if (room && room.gameState.gameStarted) {
        // Find the current player index
        const currentPlayerIndex = room.players.findIndex(p => p.id === room.gameState.currentPlayer.id);
        const nextPlayerIndex = (currentPlayerIndex + 1) % room.players.length;

        // Switch to next player
        room.gameState.currentPlayer = room.players[nextPlayerIndex];
        room.gameState.turnCount++;

        console.log(`Turn ended in room ${roomCode.toUpperCase()}, new currentPlayer: ${room.gameState.currentPlayer.id}`);

        // Broadcast turn change to all players
        io.to(roomCode.toUpperCase()).emit("turn-changed", {
          currentPlayer: room.gameState.currentPlayer,
          turnCount: room.gameState.turnCount
        });
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