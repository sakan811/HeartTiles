"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const router = useRouter();

  const handleCreateRoom = () => {
    const generatedRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(`/room/${generatedRoomCode}`);
  };

  const handleJoinRoom = () => {
    if (roomCode.trim()) {
      router.push(`/room/${roomCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="font-sans min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="text-center space-y-8">
        <div>
          <h1 className="text-6xl font-bold text-white mb-4">
            No Kitty Cards
          </h1>
          <p className="text-xl text-gray-300">
            A card game inspired by Love and Deepspace
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleCreateRoom}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            Create Room
          </button>

          <button
            onClick={() => setShowJoinDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            Join Room
          </button>
        </div>

        {showJoinDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Join Room</h2>
              <p className="text-gray-600 mb-6">Enter the room code to join an existing game</p>

              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg text-center font-mono uppercase"
                maxLength={6}
              />

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleJoinRoom}
                  disabled={!roomCode.trim()}
                  className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-colors ${
                    roomCode.trim()
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Join
                </button>

                <button
                  onClick={() => setShowJoinDialog(false)}
                  className="flex-1 py-3 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
