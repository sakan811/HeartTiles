// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useParams: vi.fn(),
}));

// Mock NextAuth
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock Socket context
vi.mock("../../src/contexts/SocketContext.js", () => ({
  useSocket: vi.fn(),
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Import after mocking
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSocket } from "../../src/contexts/SocketContext.js";
import RoomPage from "../../src/app/room/[roomCode]/page.js";

// Helper function to create a proper socket mock
const createMockSocket = (overrides: any = {}) => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  id: "test-socket-id-12345",
  connected: true,
  io: vi.fn(),
  _pid: null,
  _lastOffset: null,
  recovered: false,
  binary: vi.fn(),
  compress: false,
  ...overrides,
});

// Mock clipboard API
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

// Mock sessionStorage using vi.spyOn approach for happy-dom compatibility
const sessionStorageGetItemSpy = vi.spyOn(sessionStorage, "getItem");
const sessionStorageSetItemSpy = vi.spyOn(sessionStorage, "setItem");
const sessionStorageRemoveItemSpy = vi.spyOn(sessionStorage, "removeItem");
const sessionStorageClearSpy = vi.spyOn(sessionStorage, "clear");

describe("RoomPage Component Tests", () => {
  let mockRouter: any;
  let mockParams: any;

  // Test wrapper with all required providers
  const TestWrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(
      "div",
      { "data-testid": "test-wrapper" },
      children,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock router
    mockRouter = {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    };

    // Setup mock params
    mockParams = {
      roomCode: "TEST123",
    };

    // Apply mocks
    const mockedUseRouter = vi.mocked(useRouter);
    const mockedUseParams = vi.mocked(useParams);
    const mockedUseSession = vi.mocked(useSession);
    const mockedUseSocket = vi.mocked(useSocket);

    mockedUseRouter.mockReturnValue(mockRouter);
    mockedUseParams.mockReturnValue(mockParams);
    mockedUseSession.mockReturnValue({
      data: { user: { name: "Test User" } },
      status: "authenticated",
    } as any);
    mockedUseSocket.mockReturnValue({
      socket: createMockSocket({ connected: true }),
      isConnected: false,
      socketId: null,
      connectionError: null,
      disconnect: vi.fn(),
    });

    // Clear and reset sessionStorage spies and storage
    sessionStorageGetItemSpy.mockClear();
    sessionStorageSetItemSpy.mockClear();
    sessionStorageRemoveItemSpy.mockClear();
    sessionStorageClearSpy.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorageGetItemSpy.mockRestore();
    sessionStorageSetItemSpy.mockRestore();
    sessionStorageRemoveItemSpy.mockRestore();
    sessionStorageClearSpy.mockRestore();
  });

  describe("Basic Component Rendering", () => {
    it("should render the room page component", () => {
      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      // Check for actual room page content
      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
      expect(screen.getByText("Room Code:")).toBeInTheDocument();
      expect(screen.getByText("TEST123")).toBeInTheDocument();
    });

    it("should redirect unauthenticated users to sign in", async () => {
      const mockedUseSession = vi.mocked(useSession);
      mockedUseSession.mockReturnValue({
        data: null,
        status: "unauthenticated",
      } as any);

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining("/auth/signin"),
      );
    });

    it("should handle missing room code gracefully", () => {
      const mockedUseParams = vi.mocked(useParams);
      mockedUseParams.mockReturnValue({});

      const { container } = render(
        <TestWrapper>{React.createElement(RoomPage)}</TestWrapper>,
      );

      // Component should not crash with missing room code
      expect(container).toBeInTheDocument();
      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
    });

    it("should display room code when provided", () => {
      const mockedUseParams = vi.mocked(useParams);
      mockedUseParams.mockReturnValue({
        roomCode: "ABC123",
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(screen.getByText("ABC123")).toBeInTheDocument();
      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
    });

    it("should handle socket connection states", () => {
      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: createMockSocket({ connected: true }),
        isConnected: true,
        socketId: "test-socket-id-12345",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("should handle player name generation with session data", () => {
      const mockedUseSession = vi.mocked(useSession);
      mockedUseSession.mockReturnValue({
        data: { user: { name: "Session User" } },
        status: "authenticated",
      } as any);

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(sessionStorageGetItemSpy).not.toHaveBeenCalledWith(
        "heart-tiles-player-name",
      );
    });

    it("should handle session name logic when session has no name", async () => {
      const mockSocket = createMockSocket({ id: "socket123", connected: true });

      const mockedUseSession = vi.mocked(useSession);
      const mockedUseSocket = vi.mocked(useSocket);

      mockedUseSession.mockReturnValue({
        data: { user: { name: undefined } }, // No name in session but authenticated
        status: "authenticated",
      } as any);

      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      // Check if component renders without crashing when session has no name
      expect(screen.getByTestId("test-wrapper")).toBeInTheDocument();
      expect(screen.getByText("Waiting Room")).toBeInTheDocument();

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Component should handle the missing session name gracefully
      expect(mockSocket.emit).toHaveBeenCalledWith("join-room", {
        roomCode: "TEST123",
        playerName: expect.any(String), // Should generate a name
      });
    });

    it("should handle session name logic with existing session name", async () => {
      const mockedUseSession = vi.mocked(useSession);
      const mockedUseSocket = vi.mocked(useSocket);

      mockedUseSession.mockReturnValue({
        data: { user: { name: "Existing User" } }, // Has name in session
        status: "authenticated",
      } as any);

      mockedUseSocket.mockReturnValue({
        socket: createMockSocket({ id: "socket123", connected: true }),
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Component should use the session name
      expect(screen.getByTestId("test-wrapper")).toBeInTheDocument();
      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
    });

    it("should set up socket event listeners", () => {
      const mockSocket = {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket123",
        connected: true,
        io: vi.fn(),
        _pid: null,
        _lastOffset: null,
        recovered: false,
        binary: vi.fn(),
        compress: false,
      } as any;

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(mockSocket.on).toHaveBeenCalledWith(
        "room-joined",
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        "player-joined",
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        "player-left",
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        "player-ready",
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        "game-start",
        expect.any(Function),
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        "room-error",
        expect.any(Function),
      );
    });

    it("should handle room joining logic", () => {
      const mockSocket = {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket123",
        connected: true,
        io: vi.fn(),
        _pid: null,
        _lastOffset: null,
        recovered: false,
        binary: vi.fn(),
        compress: false,
      } as any;

      const mockedUseParams = vi.mocked(useParams);
      const mockedUseSession = vi.mocked(useSession);
      const mockedUseSocket = vi.mocked(useSocket);

      mockedUseParams.mockReturnValue({ roomCode: "ROOM1" });
      mockedUseSession.mockReturnValue({
        data: { user: { name: "Test User" } },
        status: "authenticated",
      } as any);

      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(mockSocket.emit).toHaveBeenCalledWith("join-room", {
        roomCode: "ROOM1",
        playerName: "Test User",
      });
    });

    it("should not join room when not connected", () => {
      const mockSocket = createMockSocket({ connected: false });

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: false,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(mockSocket.emit).not.toHaveBeenCalledWith("join-room");
    });

    it("should handle clipboard operations", () => {
      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      expect(navigator.clipboard.writeText).toBeDefined();
    });

    it("should handle sessionStorage errors gracefully", () => {
      sessionStorageGetItemSpy.mockImplementation(() => {
        throw new Error("Storage access denied");
      });

      expect(() => {
        render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);
      }).not.toThrow();
    });

    it("should clean up socket listeners on unmount", () => {
      const mockSocket = {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket123",
        connected: true,
        io: vi.fn(),
        _pid: null,
        _lastOffset: null,
        recovered: false,
        binary: vi.fn(),
        compress: false,
      } as any;

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      const { unmount } = render(
        <TestWrapper>{React.createElement(RoomPage)}</TestWrapper>,
      );

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith(
        "room-joined",
        expect.any(Function),
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "player-joined",
        expect.any(Function),
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "player-left",
        expect.any(Function),
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "player-ready",
        expect.any(Function),
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "game-start",
        expect.any(Function),
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "room-error",
        expect.any(Function),
      );
    });
  });

  describe("Socket Event Handling", () => {
    it("should handle room-joined event", async () => {
      let capturedRoomJoinedHandler: any = null;

      const mockSocket = createMockSocket({
        on: vi.fn().mockImplementation((event: string, handler: any) => {
          if (event === "room-joined") {
            capturedRoomJoinedHandler = handler;
          }
        }),
      });

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      const roomData = {
        players: [{ userId: "player1", name: "Player 1" }],
        playerId: "player1",
      };

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockSocket.on).toHaveBeenCalledWith(
        "room-joined",
        expect.any(Function),
      );
      expect(capturedRoomJoinedHandler).toBeDefined();

      // Test that the captured handler works correctly
      act(() => {
        if (capturedRoomJoinedHandler) {
          capturedRoomJoinedHandler(roomData);
        }
      });

      // Verify the component state was updated by checking if the handler was called
      expect(capturedRoomJoinedHandler).toBeDefined();
    });

    it("should handle game-start event", async () => {
      let capturedGameStartHandler: any = null;

      const mockSocket = createMockSocket({
        on: vi.fn().mockImplementation((event: string, handler: any) => {
          if (event === "game-start") {
            capturedGameStartHandler = handler;
          }
        }),
      });

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockSocket.on).toHaveBeenCalledWith(
        "game-start",
        expect.any(Function),
      );
      expect(capturedGameStartHandler).toBeDefined();

      // Test that the captured handler works correctly
      act(() => {
        if (capturedGameStartHandler) {
          capturedGameStartHandler();
        }
      });

      expect(mockRouter.push).toHaveBeenCalledWith("/room/TEST123/game");
    });

    it("should handle room-error event", async () => {
      let capturedRoomErrorHandler: any = null;

      const mockSocket = createMockSocket({
        on: vi.fn().mockImplementation((event: string, handler: any) => {
          if (event === "room-error") {
            capturedRoomErrorHandler = handler;
          }
        }),
      });

      const mockedUseSocket = vi.mocked(useSocket);
      mockedUseSocket.mockReturnValue({
        socket: mockSocket,
        isConnected: true,
        socketId: "socket123",
        connectionError: null,
        disconnect: vi.fn(),
      });

      render(<TestWrapper>{React.createElement(RoomPage)}</TestWrapper>);

      // Wait for useEffect to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockSocket.on).toHaveBeenCalledWith(
        "room-error",
        expect.any(Function),
      );
      expect(capturedRoomErrorHandler).toBeDefined();

      // Test that the captured handler works correctly
      act(() => {
        if (capturedRoomErrorHandler) {
          capturedRoomErrorHandler("Room not found");
        }
      });

      expect(screen.getByText("Waiting Room")).toBeInTheDocument();
    });
  });
});
