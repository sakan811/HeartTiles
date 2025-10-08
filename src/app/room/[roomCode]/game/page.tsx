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
  type?: 'heart' | 'magic' | 'wind' | 'recycle';
  name?: string;
  description?: string;
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
  type: 'wind' | 'recycle' | 'shield';
  emoji: string;
  name: string;
  description: string;
}

interface MagicDeck {
  emoji: string;
  cards: number;
  type: string;
}

export default function GameRoomPage() {
  const { data: session, status } = useSession();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerHands, setPlayerHands] = useState<Record<string, Tile[]>>({});
  const [deck, setDeck] = useState<Deck>({ emoji: "💌", cards: 16 });
  const [magicDeck, setMagicDeck] = useState<MagicDeck>({ emoji: "🔮", cards: 16, type: 'magic' });
  const [turnCount, setTurnCount] = useState(0);
  const [selectedHeart, setSelectedHeart] = useState<Tile | null>(null);
  const [selectedMagicCard, setSelectedMagicCard] = useState<MagicCard | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<string>("");
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
      console.log(`Room joined: ${data.players?.length || 0} players`);
      setPlayers(data.players || []);
      setMyPlayerId(data.playerId);
    };

    const onPlayerJoined = (data: { players: Player[] }) => {
      console.log("Player joined");
      setPlayers(data.players || []);
    };

    const onPlayerLeft = (data: { players: Player[] }) => {
      console.log("Player left");
      setPlayers(data.players || []);
    };

    const onTilesUpdated = (data: { tiles: Tile[] }) => {
      console.log(`Tiles updated: ${data.tiles.length} tiles`);
      setTiles(data.tiles);
    };

  const onGameStart = (data: {
      tiles?: Tile[];
      currentPlayer?: Player | null;
      players?: Player[];
      playerHands?: Record<string, Tile[]>;
      deck?: Deck;
      magicDeck?: MagicDeck;
      turnCount?: number;
      playerId?: string;
    }) => {
      const gameData = Array.isArray(data) ? data[0] : data;

      if (!gameData) {
        console.error("Invalid game data received");
        return;
      }

      const safeGameData = {
        tiles: gameData.tiles || [],
        currentPlayer: gameData.currentPlayer || null,
        players: gameData.players || [],
        playerHands: gameData.playerHands || {},
        deck: gameData.deck || { emoji: "💌", cards: 16 },
        magicDeck: gameData.magicDeck || { emoji: "🔮", cards: 16, type: 'magic' },
        turnCount: gameData.turnCount || 0,
        playerId: gameData.playerId || null
      };

      console.log(`Game started: ${safeGameData.players.length} players, current: ${safeGameData.currentPlayer?.name}`);

      if (safeGameData.playerId) {
        setMyPlayerId(safeGameData.playerId);
      } else if (!myPlayerId && safeGameData.players.length > 0) {
        console.warn("PlayerId not provided by server");
      }

      setTiles(safeGameData.tiles);
      setCurrentPlayer(safeGameData.currentPlayer);
      setPlayers(safeGameData.players);
      setPlayerHands(safeGameData.playerHands);
      setDeck(safeGameData.deck);
      setMagicDeck(safeGameData.magicDeck);
      setTurnCount(safeGameData.turnCount);
    };

    const onTurnChanged = (data: {
      currentPlayer: Player;
      turnCount: number;
      players?: Player[];
      playerHands?: Record<string, Tile[]>;
      deck?: Deck
    }) => {
      console.log(`Turn changed: ${data.currentPlayer.name} (turn ${data.turnCount})`);

      setCurrentPlayer(data.currentPlayer);
      setTurnCount(data.turnCount);
      if (data.players) setPlayers(data.players);
      if (data.playerHands) setPlayerHands(data.playerHands);
      if (data.deck) setDeck(data.deck);
    };

    const onHeartDrawn = (data: { players: Player[]; playerHands: Record<string, Tile[]>; deck: Deck }) => {
      console.log("Heart drawn");

      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setDeck(data.deck);

      const currentPlayerId = currentPlayer?.userId;
      if (currentPlayerId) {
        const updatedCurrentPlayer = data.players.find(p => p.userId === currentPlayerId);
        if (updatedCurrentPlayer) {
          setCurrentPlayer(updatedCurrentPlayer);
        }
      }
    };

    const onHeartPlaced = (data: { tiles: Tile[]; players: Player[]; playerHands: Record<string, Tile[]> }) => {
      console.log("Heart placed");

      setTiles(data.tiles);
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setSelectedHeart(null);
    };

    const onMagicCardDrawn = (data: { players: Player[]; playerHands: Record<string, Tile[]>; magicDeck?: MagicDeck }) => {
      console.log("Magic card drawn");

      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      if (data.magicDeck) {
        setMagicDeck(data.magicDeck);
      }

      const currentPlayerId = currentPlayer?.userId;
      if (currentPlayerId) {
        const updatedCurrentPlayer = data.players.find(p => p.userId === currentPlayerId);
        if (updatedCurrentPlayer) {
          setCurrentPlayer(updatedCurrentPlayer);
        }
      }
    };

    const onMagicCardUsed = (data: {
      card: MagicCard;
      actionResult: {
        type: string;
        description: string;
        affectedTiles?: number[];
        newValues?: Record<number, number>;
      };
      tiles: Tile[];
      players: Player[];
      playerHands: Record<string, Tile[]>;
      usedBy: string
    }) => {
      console.log(`Magic card used: ${data.card.name} (${data.card.type})`);

      setTiles(data.tiles);
      setPlayers(data.players);
      setPlayerHands(data.playerHands);
      setSelectedMagicCard(null);
    };

    const onGameOver = (data: {
      reason: string;
      players: Player[];
      winner: Player | null;
      isTie: boolean;
      finalScores: { userId: string; name: string; score: number }[];
    }) => {
      console.log("Game over:", data);

      // Update the game state to show final results
      setPlayers(data.players);
      setPlayerHands(data.players.reduce((acc, player) => {
        acc[player.userId] = player.hand || [];
        return acc;
      }, {} as Record<string, Tile[]>));

      // Could add a game over modal or notification here
      const winnerText = data.isTie
        ? "It's a tie!"
        : data.winner
          ? `${data.winner.name} wins!`
          : "Game ended";

      // For now, just show an alert
      setTimeout(() => {
        alert(`Game Over!\n${winnerText}\nReason: ${data.reason}\n\nFinal Scores:\n${data.finalScores.map(s => `${s.name}: ${s.score}`).join('\n')}`);
      }, 500);
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
    socket.on("game-over", onGameOver);
    socket.on("room-error", onRoomError);

    // Only join if we haven't already joined this room with this socket
    if (!currentRoom || currentRoom !== roomCodeParam) {
      const tempPlayerName = `Player_${socketId?.slice(-6) || 'unknown'}`;
      console.log(`Joining room ${roomCodeParam} as ${tempPlayerName}`);

      if (currentRoom && currentRoom !== roomCodeParam) {
        socket.emit("leave-room", { roomCode: currentRoom });
      }

      socket.emit("join-room", { roomCode: roomCodeParam, playerName: tempPlayerName });
      setCurrentRoom(roomCodeParam);
    }

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
      socket?.off("game-over", onGameOver);
      socket?.off("room-error", onRoomError);
    };
  }, [params.roomCode, socket, socketId, myPlayerId, currentPlayer?.userId, session, status, router, currentRoom]);

  

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
    return currentPlayer.userId === myPlayerId;
  };

  
  const selectCardFromHand = (card: Tile) => {
    if (!isCurrentPlayer()) return;

    // Properly distinguish between heart cards and magic cards
    // Heart cards have: color, value, emoji (❤️💛💚💙🤎)
    // Magic cards have: type, name, description, emoji (💨♻️)
    const isHeartCard = 'color' in card && 'value' in card &&
      ['❤️', '💛', '💚', '💙', '🤎'].includes(card.emoji);

    const isMagicCard = 'type' in card && 'name' in card &&
      ['💨', '♻️', '🛡️'].includes(card.emoji);

    if (isMagicCard) {
      // Create magic card object from hand card
      const magicCard: MagicCard = {
        id: card.id,
        type: card.type as 'wind' | 'recycle' | 'shield',
        emoji: card.emoji,
        name: card.name || 'Magic Card',
        description: card.description || 'A magic card'
      };
      setSelectedMagicCard(magicCard);
      setSelectedHeart(null);
    } else if (isHeartCard) {
      setSelectedHeart(card);
      setSelectedMagicCard(null);
    } else {
      // Fallback for any card types that don't match expected patterns
      console.warn('Unknown card type:', card);
      // Default to treating as heart card for safety
      setSelectedHeart(card);
      setSelectedMagicCard(null);
    }
  };

  const executeMagicCard = (tileId: number | string) => {
    if (socket && selectedMagicCard && roomCode && isCurrentPlayer()) {
      // Shield cards don't need a target tile, but we need to handle them differently
      if (selectedMagicCard.type === 'shield') {
        socket.emit("use-magic-card", {
          roomCode,
          cardId: selectedMagicCard.id,
          targetTileId: 'self' // Shield targets self, no tile needed
        });
      } else {
        socket.emit("use-magic-card", {
          roomCode,
          cardId: selectedMagicCard.id,
          targetTileId: tileId
        });
      }
    }
  };

  const activateShield = () => {
    if (socket && selectedMagicCard && selectedMagicCard.type === 'shield' && roomCode && isCurrentPlayer()) {
      executeMagicCard('self');
    }
  };

  const handleTileClick = (tile: Tile) => {
    if (!isCurrentPlayer()) return;

    if (selectedMagicCard) {
      if (selectedMagicCard.type === 'shield') {
        // Shield cards are used directly, not on tiles
        executeMagicCard('self');
      } else {
        executeMagicCard(Number(tile.id));
      }
    } else if (selectedHeart) {
      placeHeart(Number(tile.id));
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
          {players.length > 0 && (
            <div className="mb-6">
              <div className="text-white text-sm mb-2">Opponent Area</div>
              <div className="flex justify-center">
                {(() => {
                  const opponents = players.filter(p => p.userId !== myPlayerId);

                  if (opponents.length === 0) {
                    return <div className="text-gray-400">Waiting for opponent...</div>;
                  }

                  return opponents.map(opponent => (
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
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Game Tiles (Center) */}
          <div className="mb-6">
            <div className="text-white text-sm mb-2">
              Tiles: {tiles.length}
            </div>
            <div className="grid grid-cols-4 gap-4 max-w-md mx-auto">
              {tiles.map((tile) => {
                const hasHeart = tile.placedHeart;
                const isOccupiedByMe = hasHeart && tile.placedHeart!.placedBy === myPlayerId;
                const isOccupiedByOpponent = hasHeart && tile.placedHeart!.placedBy !== myPlayerId;
                const canPlaceHeart = selectedHeart && !hasHeart && isCurrentPlayer();
                const canUseMagicCard = selectedMagicCard && isCurrentPlayer();
                const isMagicCardTarget = selectedMagicCard && selectedMagicCard.type !== 'shield' && (
                  (selectedMagicCard.type === 'wind' && isOccupiedByOpponent) ||
                  (selectedMagicCard.type === 'recycle' && tile.color !== 'white' && !hasHeart)
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
              <div className="text-white text-sm">Magic Deck: {magicDeck.cards} cards</div>
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
                const playerHand = myPlayerData ? (playerHands[myPlayerData.userId] || []) : [];

                return playerHand.map((card) => {
                  // Use the same logic as selectCardFromHand for consistency
                  const isHeartCard = 'color' in card && 'value' in card &&
                    ['❤️', '💛', '💚', '💙', '🤎'].includes(card.emoji);
                  const isMagicCard = 'type' in card && 'name' in card &&
                    ['💨', '♻️', '🛡️'].includes(card.emoji);
                  const isSelected = isHeartCard ? selectedHeart?.id === card.id :
                                   isMagicCard ? selectedMagicCard?.id === card.id : false;

                  return (
                  <div
                    key={card.id}
                    onClick={() => isCurrentPlayer() && selectCardFromHand(card)}
                    className={`w-16 h-16 rounded-lg flex items-center justify-center text-3xl transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400/50 ring-2 ring-yellow-400'
                        : isHeartCard
                          ? 'bg-white/20 hover:bg-white/30'
                          : isMagicCard
                            ? card.emoji === '🛡️'
                              ? 'bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30'
                              : 'bg-purple-600/20 hover:bg-purple-600/30 border border-purple-400/30'
                            : 'bg-gray-600/20 hover:bg-gray-600/30'
                    }`}
                    title={
                      isHeartCard
                        ? `${card.color} heart (value: ${card.value || 1})`
                        : isMagicCard
                          ? `${card.name}: ${card.description}`
                          : 'Unknown card type'
                    }
                  >
                    <div className="relative">
                      {card.emoji}
                      {isHeartCard && card.value && (
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
                Selected: {selectedMagicCard.emoji} {selectedMagicCard.name} -
                {selectedMagicCard.type === 'shield' ? ' Click anywhere to activate' : ' Click a target tile'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 items-center">
            {isCurrentPlayer() && selectedMagicCard?.type === 'shield' && (
              <button
                onClick={activateShield}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors animate-pulse"
              >
                🛡️ Activate Shield
              </button>
            )}
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
      </div>
    </ErrorBoundary>
  );
}