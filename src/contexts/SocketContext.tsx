"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  socketId: string | null;
  connectionError: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  socketId: null,
  connectionError: null,
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
  const socketInitialized = React.useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || socketInitialized.current) return;

    let socketInstance: Socket;
    let isMounted = true;

    const initializeSocket = () => {
      try {
        console.log("Initializing new socket connection...");
        socketInstance = io();

        const onConnect = () => {
          if (!isMounted) return;
          console.log("Socket connected:", socketInstance.id);
          setIsConnected(true);
          setSocketId(socketInstance.id || null);
          setConnectionError(null);
        };

        const onDisconnect = () => {
          if (!isMounted) return;
          console.log("Socket disconnected");
          setIsConnected(false);
          setSocketId(null);
        };

        const onConnectError = (error: Error) => {
          if (!isMounted) return;
          console.error("Socket connection error:", error);
          setConnectionError(error.message);
          setIsConnected(false);
          setSocketId(null);
        };

        // Register event listeners
        socketInstance.on("connect", onConnect);
        socketInstance.on("disconnect", onDisconnect);
        socketInstance.on("connect_error", onConnectError);

        // If already connected, set the state
        if (socketInstance.connected) {
          onConnect();
        }

        setSocket(socketInstance);
        socketInitialized.current = true;
      } catch (error) {
        console.error("Failed to initialize socket:", error);
        setConnectionError(error instanceof Error ? error.message : "Unknown error");
      }
    };

    initializeSocket();

    return () => {
      isMounted = false;
      if (socketInstance) {
        console.log("Cleaning up socket connection...");
        socketInstance.off("connect");
        socketInstance.off("disconnect");
        socketInstance.off("connect_error");
        socketInstance.disconnect();
      }
    };
  }, []); // Empty dependency array - run only once

  const value: SocketContextType = {
    socket,
    isConnected,
    socketId,
    connectionError,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};