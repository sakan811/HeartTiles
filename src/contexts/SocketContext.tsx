"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  socketId: string | null;
  connectionError: string | null;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  socketId: null,
  connectionError: null,
  disconnect: () => {},
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const socketInstance = io(undefined, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected:", socketInstance.id);
      setIsConnected(true);
      setSocketId(socketInstance.id || null);
      setConnectionError(null);
    });

    socketInstance.on("disconnect", (reason: string) => {
      console.log("Socket disconnected, reason:", reason);
      setIsConnected(false);
      setSocketId(null);
    });

    socketInstance.on("connect_error", (error: Error) => {
      console.error("Socket connection error:", error);
      setConnectionError(error.message);
      setIsConnected(false);
      setSocketId(null);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const disconnect = () => {
    if (socket) {
      socket.disconnect();
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    socketId,
    connectionError,
    disconnect,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};