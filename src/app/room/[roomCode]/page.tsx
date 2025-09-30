"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "@/socket";

interface Player {
  id: string;
  name: string;
  isReady?: boolean;
}

interface Tile {
  id: number;
  color: string;
  emoji: string;
}

export default function RoomPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const { socket, isConnected, socketId } = useSocket();
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;
  const effectInitialized = useRef(false);

  useEffect(() => {
    if (!socket || !socketId || effectInitialized.current) return;

    const onRoomJoined = (data: { players: Player[], playerId: string }) => {
      console.log("Room joined event received:", data);
      setPlayers(data.players);
      setCurrentPlayerId(data.playerId);
      setError("");
    };

    const onPlayerJoined = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onPlayerLeft = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onPlayerReady = (data: { players: Player[] }) => {
      setPlayers(data.players);
    };

    const onGameStart = (data: { tiles: Tile[] }) => {
      // Store the initial tile state in localStorage for the game page
      localStorage.setItem(`tiles_${roomCode}`, JSON.stringify(data.tiles));
      router.push(`/room/${roomCode}/game`);
    };

    const onRoomError = (errorMessage: string) => {
      setError(errorMessage);
    };

    // Attach listeners first
    socket.on("room-joined", onRoomJoined);
    socket.on("player-joined", onPlayerJoined);
    socket.on("player-left", onPlayerLeft);
    socket.on("player-ready", onPlayerReady);
    socket.on("game-start", onGameStart);
    socket.on("room-error", onRoomError);

    // Then join room when socket is connected and we have socket ID
    console.log("Joining room:", roomCode, "with socket ID:", socketId);
    socket.emit("join-room", { roomCode, playerName: "Player" });

    effectInitialized.current = true;

    return () => {
      socket?.off("room-joined", onRoomJoined);
      socket?.off("player-joined", onPlayerJoined);
      socket?.off("player-left", onPlayerLeft);
      socket?.off("player-ready", onPlayerReady);
      socket?.off("game-start", onGameStart);
      socket?.off("room-error", onRoomError);
    };
  }, [roomCode, socket, socketId, router]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  const leaveRoom = () => {
    if (socket) {
      socket.emit("leave-room", { roomCode });
    }
    router.push("/");
  };

  const toggleReady = () => {
    if (socket) {
      socket.emit("player-ready", { roomCode });
    }
  };

  const getCurrentPlayer = () => {
    return players.find(player => player.id === currentPlayerId);
  };

  const canStartGame = () => {
    return players.length === 2;
  };

  const areAllPlayersReady = () => {
    return players.length === 2 && players.every(player => player.isReady);
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
                  className={`bg-white/10 rounded-lg p-4 text-center ${player.isReady ? 'ring-2 ring-green-500' : ''}`}
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-2">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white font-medium">{player.name}</p>
                  {player.isReady && (
                    <span className="text-green-400 text-sm">✓ Ready</span>
                  )}
                </div>
              ))}
            </div>
            {players.length === 0 && (
              <p className="text-gray-400 italic">No players in room yet</p>
            )}
          </div>

          <div className="text-gray-400 text-sm">
            <p>Share the room code with a friend to join the game!</p>
            <p>Players: {players.length}/2</p>
            {players.length === 0 && (
              <p className="text-blue-400">Waiting for another player to join...</p>
            )}
            {players.length === 1 && (
              <p className="text-yellow-400">Need 1 more player to start!</p>
            )}
            {players.length === 2 && (
              <p className="text-green-400">Both players joined! Ready when everyone is ready...</p>
            )}
          </div>

          <div className="flex gap-4 justify-center">
            {getCurrentPlayer() && (
              <button
                onClick={toggleReady}
                disabled={!canStartGame()}
                className={`${getCurrentPlayer()?.isReady ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} ${!canStartGame() ? 'opacity-50 cursor-not-allowed' : ''} text-white font-bold py-3 px-6 rounded-lg transition-colors`}
              >
                {getCurrentPlayer()?.isReady ? 'Cancel Ready' : 'Ready'}
              </button>
            )}
            <button
              onClick={leaveRoom}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}