"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { socket } from "@/socket";

interface Tile {
  id: number;
  color: string;
  emoji: string;
}

export default function GameRoomPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const params = useParams();
  const router = useRouter();

  const colors = ["red", "yellow", "green", "blue", "brown"];
  const emojis = ["🟥", "🟨", "🟩", "🟦", "🟫"];

  const generateRandomTiles = () => {
    const newTiles: Tile[] = [];
    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * colors.length);
      newTiles.push({
        id: i,
        color: colors[randomIndex],
        emoji: emojis[randomIndex]
      });
    }
    setTiles(newTiles);
  };

  useEffect(() => {
    const roomCodeParam = params.roomCode as string;
    setRoomCode(roomCodeParam);

    if (!socket) return;

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket?.off("connect", onConnect);
      socket?.off("disconnect", onDisconnect);
    };
  }, [params.roomCode]);

  useEffect(() => {
    generateRandomTiles();
  }, []);

  const leaveGame = () => {
    if (socket) {
      socket.emit("leave-room", { roomCode });
    }
    router.push(`/room/${roomCode}`);
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
          </div>

          <div className="grid grid-cols-4 gap-4 max-w-md mx-auto">
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className="w-20 h-20 bg-white/20 rounded-lg flex items-center justify-center text-4xl hover:bg-white/30 transition-colors cursor-pointer"
                title={`${tile.color} tile`}
              >
                {tile.emoji}
              </div>
            ))}
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={generateRandomTiles}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Shuffle Tiles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}