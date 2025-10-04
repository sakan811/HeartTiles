"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/socket";
import { useSession } from "next-auth/react";
import ErrorBoundary from "@/components/ErrorBoundary";

interface Tile {
  id: number | string;
  color: string;
  emoji: string;
  value?: number;
  placedHeart?: {
    value: number;
    color: string;
    emoji: string;
    placedBy: string;
    score: number;
  };
  type?: 'heart' | 'magic';
}

interface Player {
  userId: string;
  name: string;
  isReady: boolean;
  hand?: Tile[];
  score?: number;
}

interface Deck {
  emoji: string;
  cards: number;
  type?: string;
}

interface MagicCard {
  id: number | string;
  type: 'wind' | 'recycle';
  emoji: string;
  name: string;
  description: string;
}

interface MagicDeck {
  emoji: string;
  cards: MagicCard[];
}

export default function GameRoomPage() {
  const { data: session, status } = useSession();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerHands, setPlayerHands] = useState<Record<string, Tile[]>>({});
  const [deck, setDeck] = useState<Deck>({ emoji: "💌", cards: 10 });
  const [magicDeck, setMagicDeck] = useState<MagicDeck>({ emoji: "🔮", cards: [] });
  const [turnCount, setTurnCount] = useState(0);
  const [selectedHeart, setSelectedHeart] = useState<Tile | null>(null);
  const [selectedMagicCard, setSelectedMagicCard] = useState<MagicCard | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const { socket, isConnected, socketId, disconnect } = useSocket();
  const params = useParams();
  const router = useRouter();

  // Get current player data from server state
  const getCurrentPlayer = () => {
    if (!myPlayerId || !players.length) return null;
    return players.find(p => p.userId === myPlayerId) || null;
  };

  useEffect(() => {
    // Redirect unauthenticated users to sign in
    if (status === "loading") return;
    if (!session) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(window.location.href)}`);
      return;
    }

    const roomCodeParam = params.roomCode as string;
    setRoomCode(roomCodeParam);

    if (!socket || !socketId) return;

    const onRoomJoined = (data: { players: Player[], playerId: string }) => {
      console.log("Game page: Room joined event received:", data);
      setPlayers(data.players || []);
      setMyPlayerId(data.playerId);
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
        magicDeck: gameData.magicDeck || { emoji: "🔮", cards: [] },
        turnCount: gameData.turnCount || 0,
        playerId: gameData.playerId || null
      };

      console.log("Current player:", safeGameData.currentPlayer);
      console.log("All players:", safeGameData.players);
      console.log("Player hands:", safeGameData.playerHands);
      console.log("Tiles:", safeGameData.tiles);
      console.log("Deck:", safeGameData.deck);
      console.log("Magic Deck:", safeGameData.magicDeck);
      console.log("Turn count:", safeGameData.turnCount);
      console.log("My player ID from server:", safeGameData.playerId);

      // Update my player ID from server response
      if (safeGameData.playerId) {
        setMyPlayerId(safeGameData.playerId);
        console.log("Set my player ID from server:", safeGameData.playerId);
      } else if (!myPlayerId && safeGameData.players.length > 0) {
        console.log("Warning: playerId not provided by server, this may cause issues");
      }

      setTiles(safeGameData.tiles);
      setCurrentPlayer(safeGameData.currentPlayer);
      setPlayers(safeGameData.players);
      setPlayerHands(safeGameData.playerHands);
      setDeck(safeGameData.deck);
      setMagicDeck(safeGameData.magicDeck);
      setTurnCount(safeGameData.turnCount);

      console.log("=== GAME START STATE SET ===");
      console.log("Tiles set:", safeGameData.tiles.length);
      console.log("Players set:", safeGameData.players.length);
      console.log("Player hands keys:", Object.keys(safeGameData.playerHands));
      console.log("Current player set:", safeGameData.currentPlayer?.name);
      console.log("My player ID:", safeGameData.playerId || myPlayerId);
    };

    const onTurnChanged = (data: {
      currentPlayer: Player;
      turnCount: number;
      players?: Player[];
      playerHands?: Record<string, Tile[]>;
      deck?: Deck
    }) => {
      console.log("=== TURN CHANGED ===");
      console.log("New current player:", data.currentPlayer);
      console.log("New turn count:", data.turnCount);
      console.log("Received players:", data.players);
      console.log("Received player hands:", data.playerHands);
      console.log("Received deck:", data.deck);

      // Always update all states - they should always be provided by server
      setCurrentPlayer(data.currentPlayer);
      setTurnCount(data.turnCount);
      if (data.players) setPlayers(data.players);
      if (data.playerHands) setPlayerHands(data.playerHands);
      if (data.deck) setDeck(data.deck);
    };

    const onHeartDrawn = (data: { players: Player[]; playerHands: Record<string, Tile[]>; deck: Deck }) => {
      console.log("=== HEART DRAWN ===");
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);
      console.log("Updated deck:", data.deck);

      // Always update all states
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setDeck(data.deck);

      // Find and update current player based on current state
      const currentPlayerId = currentPlayer?.userId;
      if (currentPlayerId) {
        const updatedCurrentPlayer = data.players.find(p => p.userId === currentPlayerId);
        if (updatedCurrentPlayer) {
          setCurrentPlayer(updatedCurrentPlayer);
        }
      }

      const myPlayerData = getCurrentPlayer();
      console.log("Your hand after draw:", myPlayerData ? data.playerHands[myPlayerData.userId] || [] : "Player not found");
    };

    const onHeartPlaced = (data: { tiles: Tile[]; players: Player[]; playerHands: Record<string, Tile[]> }) => {
      console.log("=== HEART PLACED ===");
      console.log("Updated tiles:", data.tiles);
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);
      const myPlayerData = getCurrentPlayer();
      console.log("Your hand after place:", myPlayerData ? data.playerHands[myPlayerData.userId] || [] : "Player not found");
      setTiles(data.tiles);
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setSelectedHeart(null);
    };

    const onMagicCardDrawn = (data: { players: Player[]; playerHands: Record<string, Tile[]> }) => {
      console.log("=== MAGIC CARD DRAWN ===");
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);

      // Always update all states
      setPlayers(data.players);
      setPlayerHands(data.playerHands);

      // Find and update current player based on current state
      const currentPlayerId = currentPlayer?.userId;
      if (currentPlayerId) {
        const updatedCurrentPlayer = data.players.find(p => p.userId === currentPlayerId);
        if (updatedCurrentPlayer) {
          setCurrentPlayer(updatedCurrentPlayer);
        }
      }

      const myPlayerData = getCurrentPlayer();
      console.log("Your hand after magic card draw:", myPlayerData ? data.playerHands[myPlayerData.userId] || [] : "Player not found");
    };

    const onMagicCardUsed = (data: {
      card: MagicCard;
      actionResult: any;
      tiles: Tile[];
      players: Player[];
      playerHands: Record<string, Tile[]>;
      usedBy: string
    }) => {
      console.log("=== MAGIC CARD USED ===");
      console.log("Card used:", data.card);
      console.log("Action result:", data.actionResult);
      console.log("Updated tiles:", data.tiles);
      console.log("Updated players:", data.players);
      console.log("Updated player hands:", data.playerHands);
      setTiles(data.tiles);
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setSelectedMagicCard(null);
    };

    const onRoomError = (errorMessage: string) => {
      console.error("Game page: Room error:", errorMessage);
      if (errorMessage === "Room is full") {
        // Redirect back to room lobby if room is full
        router.push(`/room/${roomCodeParam}`);
        return;
      }
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
    socket.on("magic-card-drawn", onMagicCardDrawn);
    socket.on("magic-card-used", onMagicCardUsed);
    socket.on("room-error", onRoomError);

    console.log("Game room socket listeners registered");
    console.log("Current socket ID:", socketId);

    // Only join if we haven't already joined this room with this socket
    if (!socket.data?.currentRoom || socket.data.currentRoom !== roomCodeParam) {
      // Generate a simple player name - server will assign final identity
      const tempPlayerName = `Player_${socketId?.slice(-6) || 'unknown'}`;
      console.log("Game page: Joining room:", roomCodeParam, "as:", tempPlayerName, "with socket ID:", socketId);

      // Clear any existing room data to ensure clean join
      if (socket.data?.currentRoom && socket.data.currentRoom !== roomCodeParam) {
        console.log("Game page: Leaving previous room:", socket.data.currentRoom);
        socket.emit("leave-room", { roomCode: socket.data.currentRoom });
      }

      socket.emit("join-room", { roomCode: roomCodeParam, playerName: tempPlayerName });

      // Initialize socket.data if it doesn't exist
      if (!socket.data) {
        socket.data = {};
      }
      socket.data.currentRoom = roomCodeParam;
    } else {
      console.log("Game page: Already joined room:", roomCodeParam, "skipping join");
    }

    // Listen to all events to see what's happening
    socket.onAny((eventName, ...args) => {
      console.log(`Game page socket event received: ${eventName}`, args);
    });

    return () => {
      socket?.off("room-joined", onRoomJoined);
      socket?.off("player-joined", onPlayerJoined);
      socket?.off("player-left", onPlayerLeft);
      socket?.off("tiles-updated", onTilesUpdated);
      socket?.off("game-start", onGameStart);
      socket?.off("turn-changed", onTurnChanged);
      socket?.off("heart-drawn", onHeartDrawn);
      socket?.off("heart-placed", onHeartPlaced);
      socket?.off("magic-card-drawn", onMagicCardDrawn);
      socket?.off("magic-card-used", onMagicCardUsed);
      socket?.off("room-error", onRoomError);
    };
  }, [params.roomCode, socket, socketId, myPlayerId, session, status, router]);

  // Add logging for state changes
  useEffect(() => {
    console.log("=== STATE UPDATE ===");
    console.log("Tiles:", tiles);
    console.log("Players:", players);
    console.log("Player hands:", playerHands);
    console.log("Current player:", currentPlayer);
    console.log("Socket ID:", socketId);
    console.log("Deck:", deck);
    console.log("Magic Deck:", magicDeck);
    console.log("Turn count:", turnCount);
  }, [tiles, players, playerHands, currentPlayer, socketId, deck, magicDeck, turnCount]);


  const drawHeart = () => {
    if (socket && roomCode && isCurrentPlayer()) {
      socket.emit("draw-heart", { roomCode });
    }
  };

  const drawMagicCard = () => {
    if (socket && roomCode && isCurrentPlayer()) {
      socket.emit("draw-magic-card", { roomCode });
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
      // Disconnect the socket after leaving room to prevent reconnection
      setTimeout(() => {
        disconnect();
        router.push("/");
      }, 100);
    } else {
      router.push("/");
    }
  };

  const isCurrentPlayer = () => {
    if (!myPlayerId || !currentPlayer) return false;

    // Check if the current player from server state matches this client's player ID
    const isCurrentTurn = currentPlayer.userId === myPlayerId;
    const myPlayerData = getCurrentPlayer();

    console.log(`=== IS CURRENT PLAYER CHECK ===`);
    console.log(`My player ID: ${myPlayerId}`);
    console.log(`My player data:`, myPlayerData);
    console.log(`Current player from server:`, currentPlayer);
    console.log(`IDs match: ${currentPlayer.userId} === ${myPlayerId} = ${isCurrentTurn}`);

    return isCurrentTurn;
  };

  const selectMagicCard = (card: MagicCard) => {
    if (isCurrentPlayer()) {
      setSelectedMagicCard(card);
      setSelectedHeart(null); // Clear heart selection when selecting magic card
    }
  };

  const selectCardFromHand = (card: Tile) => {
    if (!isCurrentPlayer()) return;

    console.log(`=== CARD SELECTED ===`);
    console.log(`Card selected:`, card);

    // Check if card has magic card properties (type field that's not 'heart' or color field is missing)
    const isMagicCard = (card as any).type === 'recycle' || (card as any).type === 'wind';

    if (isMagicCard) {
      // Convert Tile to MagicCard interface for compatibility
      const magicCard: MagicCard = {
        id: card.id,
        type: (card as any).type === 'wind' ? 'wind' : 'recycle',
        emoji: card.emoji,
        name: (card as any).name || 'Magic Card',
        description: (card as any).description || 'A magic card'
      };
      console.log(`Magic card selected:`, magicCard);
      setSelectedMagicCard(magicCard);
      setSelectedHeart(null);
    } else {
      // Regular heart card
      console.log(`Heart card selected:`, card);
      setSelectedHeart(card);
      setSelectedMagicCard(null);
    }
  };

  const useMagicCard = (tileId: number | string) => {
    if (socket && selectedMagicCard && roomCode && isCurrentPlayer()) {
      console.log(`=== EMITTING MAGIC CARD USAGE ===`);
      console.log(`Emitting use-magic-card with:`, {
        roomCode,
        cardId: selectedMagicCard.id,
        targetTileId: tileId,
        cardType: selectedMagicCard.type
      });
      socket.emit("use-magic-card", {
        roomCode,
        cardId: selectedMagicCard.id,
        targetTileId: tileId
      });
    }
  };

  const handleTileClick = (tile: Tile) => {
    if (!isCurrentPlayer()) return;

    console.log(`=== TILE CLICK ===`);
    console.log(`Tile clicked:`, tile);
    console.log(`Selected magic card:`, selectedMagicCard);
    console.log(`Selected heart:`, selectedHeart);

    if (selectedMagicCard) {
      // Use magic card on tile
      console.log(`Using magic card ${selectedMagicCard.type} on tile ${tile.id}`);
      useMagicCard(Number(tile.id));
    } else if (selectedHeart) {
      // Place heart on tile (existing functionality)
      console.log(`Placing heart on tile ${tile.id}`);
      placeHeart(tile.id);
    }
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

            {/* Score Display */}
            <div className="mt-4 p-3 bg-white/10 rounded-lg">
              <h3 className="text-white text-sm font-semibold mb-2">Scores</h3>
              {players.map(player => (
                <div key={player.userId} className="flex justify-between items-center text-sm">
                  <span className={player.userId === myPlayerId ? "text-green-400" : "text-yellow-400"}>
                    {player.name} {player.userId === myPlayerId && "(You)"}
                  </span>
                  <span className="text-white font-bold">{player.score || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Opponent Display (Top) */}
          {(() => {
            console.log("=== OPPONENT DISPLAY RENDER CHECK ===");
            const myPlayerData = getCurrentPlayer();
            console.log("My player data:", myPlayerData);
            console.log("Players array:", players);
            console.log("Players length:", players.length);
            console.log("Should show opponent section:", players.length > 0);
            return players.length > 0;
          })() && (
            <div className="mb-6">
              <div className="text-white text-sm mb-2">Opponent Area</div>
              <div className="flex justify-center">
                {(() => {
                  const myPlayerData = getCurrentPlayer();
                  const opponents = players.filter(p => p.userId !== myPlayerId);
                  console.log("=== OPPONENT RENDERING ===");
                  console.log("Current players array:", players);
                  console.log("My player data:", myPlayerData);
                  console.log("My player ID:", myPlayerId);
                  console.log("Each player ID comparison:");
                  players.forEach(p => console.log(`Player ${p.name} (${p.userId}) == my ID ${myPlayerId}: ${p.userId === myPlayerId}`));
                  console.log("Filtered opponents:", opponents);
                  console.log("Player hands object:", playerHands);

                  if (opponents.length === 0) {
                    console.log("No opponents found - all players match current player ID");
                    return <div className="text-gray-400">Waiting for opponent...</div>;
                  }

                  return opponents.map(opponent => {
                    console.log("Rendering opponent:", opponent);
                    console.log("Opponent hand:", playerHands[opponent.userId]);
                    return (
                    <div key={opponent.userId} className="bg-white/20 rounded-lg p-4 flex flex-col items-center mx-2">
                      <div className="text-4xl mb-2">👤</div>
                      <div className="text-white text-sm font-semibold">
                        {opponent.name}
                      </div>
                      <div className="text-gray-300 text-xs mt-1">
                        Cards: {playerHands[opponent.userId]?.length || 0}
                      </div>
                      <div className="text-yellow-300 text-xs mt-1 font-bold">
                        Score: {opponent.score || 0}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {playerHands[opponent.userId]?.map((_heart: Tile, index: number) => (
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
                const hasHeart = tile.placedHeart;
                const isOccupiedByMe = hasHeart && tile.placedHeart!.placedBy === myPlayerId;
                const isOccupiedByOpponent = hasHeart && tile.placedHeart!.placedBy !== myPlayerId;
                const canPlaceHeart = selectedHeart && !hasHeart && isCurrentPlayer();
                const canUseMagicCard = selectedMagicCard && isCurrentPlayer();
                const isMagicCardTarget = selectedMagicCard && (
                  (selectedMagicCard.type === 'wind' && isOccupiedByOpponent) ||
                  (selectedMagicCard.type === 'recycle' && tile.color !== 'white')
                );

                return (
                <div
                  key={tile.id}
                  onClick={() => handleTileClick(tile)}
                  className={`w-20 h-20 rounded-lg flex items-center justify-center text-4xl transition-colors relative ${
                    canPlaceHeart
                      ? 'hover:bg-white/30 bg-white/20 cursor-pointer'
                      : canUseMagicCard && isMagicCardTarget
                        ? 'hover:bg-purple-400/30 bg-purple-400/20 cursor-pointer border-2 border-purple-400/50'
                        : hasHeart
                          ? 'cursor-not-allowed'
                          : 'bg-white/10 cursor-not-allowed'
                  } ${
                    isOccupiedByMe
                      ? 'ring-4 ring-green-400 bg-green-900/30'
                      : isOccupiedByOpponent
                        ? 'ring-4 ring-red-400 bg-red-900/30'
                        : ''
                  }`}
                  title={`${tile.color} tile${
                    hasHeart
                      ? ` - ${tile.placedHeart!.emoji} by ${tile.placedHeart!.placedBy === myPlayerId ? 'you' : 'opponent'} (score: ${tile.placedHeart!.score})`
                      : canPlaceHeart
                        ? ' - Click to place heart'
                        : ''
                  }`}
                >
                  {tile.emoji}
                  {hasHeart && (
                    <div className={`absolute top-0 right-0 text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold transform translate-x-1 -translate-y-1 ${
                      isOccupiedByMe ? 'bg-green-400' : 'bg-red-400'
                    }`}>
                      {tile.placedHeart!.score}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>

          {/* Central Deck */}
          <div className="flex justify-center gap-4 mb-6">
            <div className="bg-white/20 rounded-lg p-4 flex flex-col items-center">
              <div className="text-6xl mb-2">{deck.emoji}</div>
              <div className="text-white text-sm">Heart Deck: {deck.cards} cards</div>
            </div>
            <div className="bg-purple-600/20 rounded-lg p-4 flex flex-col items-center border border-purple-400/30">
              <div className="text-6xl mb-2">{magicDeck.emoji}</div>
              <div className="text-white text-sm">Magic Deck: {magicDeck.cards.length} cards</div>
            </div>
          </div>
          </div>

          {/* Player Hands (Bottom) */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-white text-lg font-semibold">
                Your Hand
              </h3>
              {(() => {
                const myPlayerData = getCurrentPlayer();
                return myPlayerData && (
                  <div className="text-green-400 text-lg font-bold">
                    Score: {myPlayerData.score || 0}
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {(() => {
                const myPlayerData = getCurrentPlayer();
                console.log("=== PLAYER HANDS RENDERING ===");
                console.log("My player data:", myPlayerData);
                console.log("Player hands object:", playerHands);
                console.log("Your hand:", myPlayerData ? playerHands[myPlayerData.userId] : "Not found");
                console.log("Your hand length:", myPlayerData ? (playerHands[myPlayerData.userId] || []).length : 0);
                return null;
              })()}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {(() => {
                const myPlayerData = getCurrentPlayer();
                const playerHand = myPlayerData ? (playerHands[myPlayerData.userId] || []) : [];

                console.log("=== PLAYER HAND RENDER LOGIC ===");
                console.log("My player data:", myPlayerData);
                console.log("Using player ID for hand lookup:", myPlayerId);
                console.log("Available player hands keys:", Object.keys(playerHands));
                console.log("Your hand:", playerHand);

                return playerHand.map((card) => {
                  console.log("Rendering your card:", card);
                  const isHeart = card.type !== 'magic';
                  const isSelected = isHeart ? selectedHeart?.id === card.id : selectedMagicCard?.id === card.id;

                  return (
                  <div
                    key={card.id}
                    onClick={() => isCurrentPlayer() && selectCardFromHand(card)}
                    className={`w-16 h-16 rounded-lg flex items-center justify-center text-3xl transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400/50 ring-2 ring-yellow-400'
                        : isHeart
                          ? 'bg-white/20 hover:bg-white/30'
                          : 'bg-purple-600/20 hover:bg-purple-600/30 border border-purple-400/30'
                    }`}
                    title={
                      isHeart
                        ? `${card.color} heart (value: ${card.value || 1})`
                        : `${(card as any).name}: ${(card as any).description}`
                    }
                  >
                    <div className="relative">
                      {card.emoji}
                      {isHeart && card.value && (
                        <span className="absolute -top-1 -right-1 text-xs bg-white/80 text-black rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {card.value}
                        </span>
                      )}
                    </div>
                  </div>
                );
                });
              })()}
            </div>
            {selectedHeart && (
              <p className="text-center text-yellow-400 mt-2">
                Selected: {selectedHeart.emoji} (value: {selectedHeart.value || 1}) - Click a tile to place it
              </p>
            )}
            {selectedMagicCard && (
              <p className="text-center text-purple-400 mt-2">
                Selected: {selectedMagicCard.emoji} {selectedMagicCard.name} - Click a target tile
              </p>
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
                  onClick={drawMagicCard}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  Draw Magic Card
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
    </ErrorBoundary>
  );
}