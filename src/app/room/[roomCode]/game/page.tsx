"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/socket";
import ErrorBoundary from "@/components/ErrorBoundary";

interface Tile {
  id: number | string;
  color: string;
  emoji: string;
}

interface Player {
  id: string;
  name: string;
  isReady: boolean;
  hand?: Tile[];
}

interface Deck {
  emoji: string;
  cards: number;
}

export default function GameRoomPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerHands, setPlayerHands] = useState<Record<string, Tile[]>>({});
  const [deck, setDeck] = useState<Deck>({ emoji: "💌", cards: 10 });
  const [turnCount, setTurnCount] = useState(0);
  const [selectedHeart, setSelectedHeart] = useState<Tile | null>(null);
  const { socket, isConnected, socketId } = useSocket();
  const params = useParams();
  const router = useRouter();
  const effectInitialized = useRef(false);

  // Get persistent player name
  const getPlayerName = () => {
    return localStorage.getItem(`playerName_${roomCode}`) || `Player_${socketId?.slice(-4) || 'Unknown'}`;
  };

  useEffect(() => {
    const roomCodeParam = params.roomCode as string;
    setRoomCode(roomCodeParam);

    // Load saved game state from localStorage
    const savedGameState = localStorage.getItem(`gameState_${roomCodeParam}`);
    if (savedGameState) {
      try {
        const gameState = JSON.parse(savedGameState);
        console.log("Loading saved game state:", gameState);

        // Handle both array and object formats
        const gameData = Array.isArray(gameState) ? gameState[0] : gameState;

        if (gameData && gameData.tiles) {
          setTiles(gameData.tiles);
          setCurrentPlayer(gameData.currentPlayer);
          setPlayers(gameData.players || []);
          setPlayerHands(gameData.playerHands || {});
          setDeck(gameData.deck || { emoji: "💌", cards: 10 });
          setTurnCount(gameData.turnCount || 0);
        }
      } catch (error) {
        console.error("Error parsing saved game state:", error);
      }
      localStorage.removeItem(`gameState_${roomCodeParam}`);
    }

    // Load initial tiles from localStorage (fallback)
    const savedTiles = localStorage.getItem(`tiles_${roomCodeParam}`);
    if (savedTiles && tiles.length === 0) {
      setTiles(JSON.parse(savedTiles));
      localStorage.removeItem(`tiles_${roomCodeParam}`);
    }

    if (!socket || !socketId || effectInitialized.current) return;

    const onRoomJoined = (data: { players: Player[], playerId: string }) => {
      console.log("Game page: Room joined event received:", data);
      setPlayers(data.players || []);
    };

    const onPlayerJoined = (data: { players: Player[] }) => {
      console.log("Game page: Player joined event received:", data);
      setPlayers(data.players || []);
    };

    const onPlayerLeft = (data: { players: Player[] }) => {
      console.log("Game page: Player left event received:", data);
      setPlayers(data.players || []);
    };

    const onTilesUpdated = (data: { tiles: Tile[] }) => {
      console.log("=== TILES UPDATED ===");
      console.log("New tiles data:", data.tiles);
      console.log("Number of tiles:", data.tiles.length);
      setTiles(data.tiles);
    };

  const onGameStart = (data: any) => {
      // Handle both cases: data as object or data wrapped in array
      const gameData = Array.isArray(data) ? data[0] : data;

      console.log("=== GAME START DATA RECEIVED ===");
      console.log("Raw data:", data);
      console.log("Processed gameData:", gameData);
      console.log("Socket ID:", socketId);

      // Check if gameData exists and has expected properties
      if (!gameData) {
        console.error("Invalid game data received:", gameData);
        return;
      }

      // Ensure all required properties have fallback values
      const safeGameData = {
        tiles: gameData.tiles || [],
        currentPlayer: gameData.currentPlayer || null,
        players: gameData.players || [],
        playerHands: gameData.playerHands || {},
        deck: gameData.deck || { emoji: "💌", cards: 10 },
        turnCount: gameData.turnCount || 0
      };

      console.log("Current player:", safeGameData.currentPlayer);
      console.log("All players:", safeGameData.players);
      console.log("Player hands:", safeGameData.playerHands);
      console.log("Tiles:", safeGameData.tiles);
      console.log("Deck:", safeGameData.deck);
      console.log("Turn count:", safeGameData.turnCount);

      // Log each player's hand details
      Object.entries(safeGameData.playerHands).forEach(([playerId, hand]) => {
        console.log(`Player ${playerId} hand:`, hand);
        console.log(`Player ${playerId} hand length:`, hand.length);
      });

      setTiles(safeGameData.tiles);
      setCurrentPlayer(safeGameData.currentPlayer);
      setPlayers(safeGameData.players);
      setPlayerHands(safeGameData.playerHands);
      setDeck(safeGameData.deck);
      setTurnCount(safeGameData.turnCount);
    };

    const onTurnChanged = (data: { currentPlayer: Player; turnCount: number }) => {
      setCurrentPlayer(data.currentPlayer);
      setTurnCount(data.turnCount);
    };

    const onHeartDrawn = (data: { players: Player[]; playerHands: Record<string, Tile[]>; deck: Deck }) => {
      console.log("=== HEART DRAWN ===");
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);
      console.log("Updated deck:", data.deck);
      const playerName = getPlayerName();
      const currentPlayerData = data.players.find(p => p.name === playerName);
      console.log("Your hand after draw:", currentPlayerData ? data.playerHands[currentPlayerData.id] || [] : "Player not found");
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setDeck(data.deck);
    };

    const onHeartPlaced = (data: { tiles: Tile[]; players: Player[]; playerHands: Record<string, Tile[]> }) => {
      console.log("=== HEART PLACED ===");
      console.log("Updated tiles:", data.tiles);
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);
      const playerName = getPlayerName();
      const currentPlayerData = data.players.find(p => p.name === playerName);
      console.log("Your hand after place:", currentPlayerData ? data.playerHands[currentPlayerData.id] || [] : "Player not found");
      setTiles(data.tiles);
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setSelectedHeart(null);
    };

    // Attach all listeners first
    socket.on("room-joined", onRoomJoined);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("tiles-updated", onTilesUpdated);
    socket.on("game-start", onGameStart);
    socket.on("turn-changed", onTurnChanged);
    socket.on("heart-drawn", onHeartDrawn);
    socket.on("heart-placed", onHeartPlaced);

    console.log("Game room socket listeners registered");
    console.log("Current socket ID:", socketId);

    // Then join the room to get current state
    const playerName = getPlayerName();
    console.log("Game page: Joining room:", roomCodeParam, "as:", playerName, "with socket ID:", socketId);
    socket.emit("join-room", { roomCode: roomCodeParam, playerName });

    // Listen to all events to see what's happening
    socket.onAny((eventName, ...args) => {
      console.log(`Game page socket event received: ${eventName}`, args);
    });

    effectInitialized.current = true;

    return () => {
      socket?.off("room-joined", onRoomJoined);
      socket?.off("player-joined", onPlayerJoined);
      socket?.off("player-left", onPlayerLeft);
      socket?.off("tiles-updated", onTilesUpdated);
      socket?.off("game-start", onGameStart);
      socket?.off("turn-changed", onTurnChanged);
      socket?.off("heart-drawn", onHeartDrawn);
      socket?.off("heart-placed", onHeartPlaced);
    };
  }, [params.roomCode, socket, socketId, tiles.length]);

  // Add logging for state changes
  useEffect(() => {
    console.log("=== STATE UPDATE ===");
    console.log("Tiles:", tiles);
    console.log("Players:", players);
    console.log("Player hands:", playerHands);
    console.log("Current player:", currentPlayer);
    console.log("Socket ID:", socketId);
    console.log("Deck:", deck);
    console.log("Turn count:", turnCount);
  }, [tiles, players, playerHands, currentPlayer, socketId, deck, turnCount]);


  const drawHeart = () => {
    if (socket && roomCode && isCurrentPlayer()) {
      socket.emit("draw-heart", { roomCode });
    }
  };

  const placeHeart = (tileId: number) => {
    if (socket && roomCode && isCurrentPlayer() && selectedHeart) {
      socket.emit("place-heart", { roomCode, tileId, heartId: selectedHeart.id });
    }
  };

  const endTurn = () => {
    if (socket && roomCode) {
      setSelectedHeart(null);
      socket.emit("end-turn", { roomCode });
    }
  };

  const leaveGame = () => {
    if (socket) {
      socket.emit("leave-room", { roomCode });
    }
    router.push(`/room/${roomCode}`);
  };

  const isCurrentPlayer = () => {
    if (!socketId || !currentPlayer) return false;

    // First try to match by session ID (for persistent players)
    const playerName = getPlayerName();
    const currentPlayerInList = players.find(p => p.name === playerName);
    if (currentPlayerInList) {
      return currentPlayerInList.id === currentPlayer.id;
    }

    // Fallback to socket ID matching
    return socketId === currentPlayer.id;
  };

  return (
    <ErrorBoundary>
      <div className="font-sans min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-4xl w-full mx-4 shadow-2xl">
        <div className="text-center space-y-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
              <span className="text-gray-300">
                {isConnected ? "Connected" : "Connecting..."}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-white">Game Room</h1>
            <button
              onClick={leaveGame}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Leave Game
            </button>
          </div>

          <div className="text-gray-300">
            <p className="text-lg mb-2">Room Code: <span className="font-mono text-xl font-bold">{roomCode}</span></p>
            <p className="text-sm">Match the colored tiles!</p>
            {currentPlayer && (
              <p className="text-lg font-semibold mt-2">
                Current Player: <span className={isCurrentPlayer() ? "text-green-400" : "text-yellow-400"}>{currentPlayer.name}</span>
                {isCurrentPlayer() && " (You)"}
              </p>
            )}
            <p className="text-sm">Turn: {turnCount}</p>
          </div>

          {/* Opponent Display (Top) */}
          {(() => {
            console.log("=== OPPONENT DISPLAY RENDER CHECK ===");
            const playerName = getPlayerName();
            console.log("Player name:", playerName);
            console.log("Players array:", players);
            console.log("Players length:", players.length);
            console.log("Should show opponent section:", players.length > 0);
            return players.length > 0;
          })() && (
            <div className="mb-6">
              <div className="text-white text-sm mb-2">Opponent Area</div>
              <div className="flex justify-center">
                {(() => {
                  const playerName = getPlayerName();
                  const currentPlayerData = players.find(p => p.name === playerName);
                  const opponents = players.filter(p => p.name !== playerName);
                  console.log("=== OPPONENT RENDERING ===");
                  console.log("Current players array:", players);
                  console.log("Current player name:", playerName);
                  console.log("Current player data:", currentPlayerData);
                  console.log("Each player name comparison:");
                  players.forEach(p => console.log(`Player ${p.name} (${p.id}) == current name ${playerName}: ${p.name === playerName}`));
                  console.log("Filtered opponents:", opponents);
                  console.log("Player hands object:", playerHands);

                  if (opponents.length === 0) {
                    console.log("No opponents found - all players match current socket ID");
                    return <div className="text-gray-400">Waiting for opponent...</div>;
                  }

                  return opponents.map(opponent => {
                    console.log("Rendering opponent:", opponent);
                    console.log("Opponent hand:", playerHands[opponent.id]);
                    return (
                    <div key={opponent.id} className="bg-white/20 rounded-lg p-4 flex flex-col items-center mx-2">
                      <div className="text-4xl mb-2">👤</div>
                      <div className="text-white text-sm font-semibold">
                        {opponent.name}
                      </div>
                      <div className="text-gray-300 text-xs mt-1">
                        Cards: {playerHands[opponent.id]?.length || 0}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {playerHands[opponent.id]?.map((heart: Tile, index: number) => (
                          <div key={index} className="text-2xl">
                            🂠
                          </div>
                        ))}
                      </div>
                    </div>
                  )});
                })()}
              </div>
            </div>
          )}

          {/* Game Tiles (Center) */}
          <div className="mb-6">
            <div className="text-white text-sm mb-2">
              Tiles: {tiles.length}
              {(() => {
                console.log("=== TILES RENDERING ===");
                console.log("Tiles array:", tiles);
                console.log("Tiles length:", tiles.length);
                return null;
              })()}
            </div>
            <div className="grid grid-cols-4 gap-4 max-w-md mx-auto">
              {tiles.map((tile) => {
                console.log("Rendering tile:", tile);
                return (
                <div
                  key={tile.id}
                  onClick={() => selectedHeart && placeHeart(tile.id)}
                  className={`w-20 h-20 rounded-lg flex items-center justify-center text-4xl transition-colors cursor-pointer ${
                    selectedHeart ? 'hover:bg-white/30 bg-white/20' : 'bg-white/10 cursor-not-allowed'
                  }`}
                  title={`${tile.color} tile`}
                >
                  {tile.emoji}
                </div>
              )})}
            </div>
          </div>

          {/* Central Deck */}
          <div className="flex justify-center mb-6">
            <div className="bg-white/20 rounded-lg p-4 flex flex-col items-center">
              <div className="text-6xl mb-2">{deck.emoji}</div>
              <div className="text-white text-sm">Deck: {deck.cards} cards</div>
            </div>
          </div>

          {/* Player Hands (Bottom) */}
          <div className="mb-6">
            <h3 className="text-white text-lg font-semibold mb-3">
              Your Hearts
              {(() => {
                const playerName = getPlayerName();
                const currentPlayerData = players.find(p => p.name === playerName);
                const currentPlayerId = currentPlayerData?.id || socketId || "";
                console.log("=== PLAYER HANDS RENDERING ===");
                console.log("Player name:", playerName);
                console.log("Current player data:", currentPlayerData);
                console.log("Player hands object:", playerHands);
                console.log("Your hand:", playerHands[currentPlayerId]);
                console.log("Your hand length:", playerHands[currentPlayerId]?.length || 0);
                return null;
              })()}
            </h3>
            <div className="flex flex-wrap gap-2 justify-center">
              {(() => {
                const playerName = getPlayerName();
                const currentPlayerData = players.find(p => p.name === playerName);
                const currentPlayerId = currentPlayerData?.id || socketId || "";
                const playerHand = playerHands[currentPlayerId] || [];

                return playerHand.map((heart) => {
                  console.log("Rendering your heart:", heart);
                  return (
                  <div
                    key={heart.id}
                    onClick={() => isCurrentPlayer() && setSelectedHeart(heart)}
                    className={`w-16 h-16 rounded-lg flex items-center justify-center text-3xl transition-colors cursor-pointer ${
                      selectedHeart?.id === heart.id
                        ? 'bg-yellow-400/50 ring-2 ring-yellow-400'
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                    title={`${heart.color} heart`}
                  >
                    {heart.emoji}
                  </div>
                );
                });
              })()}
            </div>
            {selectedHeart && (
              <p className="text-center text-yellow-400 mt-2">Selected: {selectedHeart.emoji} - Click a tile to place it</p>
            )}
          </div>

          <div className="flex gap-4 justify-center">
            {isCurrentPlayer() && (
              <>
                <button
                  onClick={drawHeart}
                  disabled={deck.cards <= 0}
                  className={`font-bold py-3 px-6 rounded-lg transition-colors ${
                    deck.cards <= 0
                      ? "bg-gray-500 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
                >
                  Draw Heart
                </button>
                <button
                  onClick={endTurn}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  End Turn
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </ErrorBoundary>
  );
}