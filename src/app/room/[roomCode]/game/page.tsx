"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { socket } from "@/socket";

interface Tile {
  id: number;
  color: string;
  emoji: string;
}

interface Player {
  id: string;
  name: string;
  isReady: boolean;
}

interface Deck {
  emoji: string;
  cards: number;
}

export default function GameRoomPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [playerHands, setPlayerHands] = useState<Record<string, Tile[]>>({});
  const [deck, setDeck] = useState<Deck>({ emoji: "💌", cards: 10 });
  const [turnCount, setTurnCount] = useState(0);
  const [selectedHeart, setSelectedHeart] = useState<Tile | null>(null);
  const params = useParams();
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const roomCodeParam = params.roomCode as string;
    setRoomCode(roomCodeParam);

    // Load initial tiles from localStorage
    const savedTiles = localStorage.getItem(`tiles_${roomCodeParam}`);
    if (savedTiles) {
      setTiles(JSON.parse(savedTiles));
      localStorage.removeItem(`tiles_${roomCodeParam}`);
    }

    if (!socket) return;

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onTilesUpdated = (data: { tiles: Tile[] }) => {
      setTiles(data.tiles);
    };

    const onGameStart = (data: {
      tiles: Tile[];
      currentPlayer: Player;
      playerHands: Record<string, Tile[]>;
      deck: Deck;
      turnCount: number;
    }) => {
      setTiles(data.tiles);
      setCurrentPlayer(data.currentPlayer);
      setPlayerHands(data.playerHands);
      setDeck(data.deck);
      setTurnCount(data.turnCount);
    };

    const onTurnChanged = (data: { currentPlayer: Player; turnCount: number }) => {
      setCurrentPlayer(data.currentPlayer);
      setTurnCount(data.turnCount);
    };

    const onHeartDrawn = (data: { playerHands: Record<string, Tile[]>; deck: Deck }) => {
      setPlayerHands(data.playerHands);
      setDeck(data.deck);
    };

    const onHeartPlaced = (data: { tiles: Tile[]; playerHands: Record<string, Tile[]> }) => {
      setTiles(data.tiles);
      setPlayerHands(data.playerHands);
      setSelectedHeart(null);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("tiles-updated", onTilesUpdated);
    socket.on("game-start", onGameStart);
    socket.on("turn-changed", onTurnChanged);
    socket.on("heart-drawn", onHeartDrawn);
    socket.on("heart-placed", onHeartPlaced);

    return () => {
      socket?.off("connect", onConnect);
      socket?.off("disconnect", onDisconnect);
      socket?.off("tiles-updated", onTilesUpdated);
      socket?.off("game-start", onGameStart);
      socket?.off("turn-changed", onTurnChanged);
      socket?.off("heart-drawn", onHeartDrawn);
      socket?.off("heart-placed", onHeartPlaced);
    };
  }, [params.roomCode]);

  
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
    return socket && currentPlayer && socket.id === currentPlayer.id;
  };

  return (
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
          <div className="mb-6">
            <div className="flex justify-center">
              <div className="bg-white/20 rounded-lg p-4 flex flex-col items-center">
                <div className="text-4xl mb-2">👤</div>
                <div className="text-white text-sm font-semibold">
                  {currentPlayer && socket?.id !== currentPlayer.id ? currentPlayer.name : "Opponent"}
                </div>
                <div className="text-gray-300 text-xs mt-1">
                  Cards: {Object.entries(playerHands).filter(([id]) => id !== socket?.id).reduce((acc, [_, hand]) => acc + hand.length, 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Game Tiles (Center) */}
          <div className="mb-6">
            <div className="text-white text-sm mb-2">Tiles: {tiles.length}</div>
            <div className="grid grid-cols-4 gap-4 max-w-md mx-auto">
              {tiles.map((tile) => (
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
              ))}
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
            <h3 className="text-white text-lg font-semibold mb-3">Your Hearts</h3>
            {isClient && (
              <div className="text-white text-sm mb-2">Socket ID: {socket?.id || "No socket"}</div>
            )}
            <div className="text-white text-sm mb-2">Hands count: {Object.keys(playerHands).length}</div>
            <div className="text-white text-sm mb-2">Your hands: {playerHands[socket?.id || ""]?.length || 0}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {playerHands[socket?.id || ""]?.map((heart) => (
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
              ))}
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
  );
}