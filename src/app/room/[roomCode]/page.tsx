"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { socket } from "@/socket";

interface Player {
  id: string;
  name: string;
}

export default function RoomPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => {
      setIsConnected(true);
      socket?.emit("join-room", { roomCode, playerName: "Player" });
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onRoomJoined = (data: { players: Player[] }) => {
      setPlayers(data.players);
      setError("");
    };

    const onPlayerJoined = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onPlayerLeft = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onRoomError = (errorMessage: string) => {
      setError(errorMessage);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room-joined", onRoomJoined);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("room-error", onRoomError);

    return () => {
      socket?.off("connect", onConnect);
      socket?.off("disconnect", onDisconnect);
      socket?.off("room-joined", onRoomJoined);
      socket?.off("player-joined", onPlayerJoined);
      socket?.off("player-left", onPlayerLeft);
      socket?.off("room-error", onRoomError);
    };
  }, [roomCode, socket]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit("leave-room", { roomCode });
    }
    router.push("/");
  };

  return (
    <div className="font-sans min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Waiting Room</h1>
            <div className="flex items-center justify-center gap-2">
              <p className="text-gray-300">Room Code:</p>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 px-4 py-2 rounded-lg font-mono text-xl font-bold text-white">
                  {roomCode}
                </span>
                <button
                  onClick={copyRoomCode}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                  title="Copy room code"
                >
                  📋
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-gray-300">
              {isConnected ? "Connected" : "Connecting..."}
            </span>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-semibold text-white mb-4">Players in Room</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="bg-white/10 rounded-lg p-4 text-center"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-2">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white font-medium">{player.name}</p>
                </div>
              ))}
            </div>
            {players.length === 0 && (
              <p className="text-gray-400 italic">No players in room yet</p>
            )}
          </div>

          <div className="text-gray-400 text-sm">
            <p>Share the room code with friends to join the game!</p>
            <p>Players: {players.length}/4</p>
          </div>

          <button
            onClick={leaveRoom}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}