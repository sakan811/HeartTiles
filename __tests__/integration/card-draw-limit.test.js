// Integration tests for validateCardDrawLimit function
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { createServer } from "node:http";
import { io as ioc } from "socket.io-client";
import { Server } from "socket.io";

// Import database utility functions from server-test-utils.js
import {
  connectToDatabase,
  disconnectDatabase,
  clearDatabase,
} from "../utils/server-test-utils.js";

// Import the actual validateCardDrawLimit function from server
import { validateCardDrawLimit } from "../../server.js";

// Import helper functions from setup.js
import { createMockRoom, createMockUser } from "./setup.js";

// Mock next-auth/jwt for authentication
const mockGetToken = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: mockGetToken,
}));

// Mock database models
const mockUserFindById = vi.fn();
vi.mock("../../models.js", () => ({
  User: {
    findById: mockUserFindById,
  },
  Room: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
  PlayerSession: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

describe("validateCardDrawLimit Integration Tests", () => {
  let io, clientSocket, httpServer;

  beforeAll(async () => {
    // Set up mock authentication
    mockGetToken.mockResolvedValue({
      id: "test-user-1",
      email: "test@example.com",
      name: "Test User",
    });

    mockUserFindById.mockResolvedValue({
      _id: "test-user-1",
      id: "test-user-1",
      name: "Test User",
      email: "test@example.com",
    });

    // Set up Socket.IO server
    await new Promise((resolve) => {
      httpServer = createServer();
      io = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
        },
      });

      httpServer.listen(() => {
        const port = httpServer.address().port;
        clientSocket = ioc(`http://localhost:${port}`);
        clientSocket.on("connect", resolve);
      });
    });

    try {
      await connectToDatabase();
    } catch (error) {
      console.warn("Database connection failed, skipping tests:", error.message);
    }
  });

  afterAll(async () => {
    // Clean up Socket.IO server
    if (io) io.close();
    if (clientSocket) clientSocket.disconnect();
    if (httpServer) httpServer.close();

    try {
      await disconnectDatabase();
    } catch (error) {
      console.warn("Database disconnection failed:", error.message);
    }
  });

  beforeEach(async () => {
    try {
      await clearDatabase();
    } catch (error) {
      console.warn("Database clear failed:", error.message);
    }
  });

  it("should initialize playerActions for new user", () => {
    // Create a mock room without playerActions
    const room = createMockRoom("TEST01", {
      players: [createMockUser("test-user-1", "Test User", "test@example.com")],
      gameState: {
        ...createMockRoom().gameState,
        playerActions: undefined, // Explicitly undefined
      },
    });

    // Call validateCardDrawLimit which should initialize playerActions
    const result = validateCardDrawLimit(room, "test-user-1");

    expect(result.valid).toBe(true);
    expect(result.currentActions).toBeDefined();
    expect(result.currentActions.drawnHeart).toBe(false);
    expect(result.currentActions.drawnMagic).toBe(false);
    expect(result.currentActions.heartsPlaced).toBe(0);
    expect(result.currentActions.magicCardsUsed).toBe(0);

    // Verify that the function modified the room object
    expect(room.gameState.playerActions).toBeDefined();
    expect(room.gameState.playerActions["test-user-1"]).toBeDefined();
  });

  it("should return existing playerActions for existing user", () => {
    // Create a mock room with existing playerActions
    const existingActions = {
      drawnHeart: true,
      drawnMagic: false,
      heartsPlaced: 1,
      magicCardsUsed: 0,
    };

    const room = createMockRoom("TEST01", {
      players: [createMockUser("test-user-1", "Test User", "test@example.com")],
      gameState: {
        ...createMockRoom().gameState,
        playerActions: {
          "test-user-1": existingActions,
        },
      },
    });

    // Call validateCardDrawLimit which should return existing actions
    const result = validateCardDrawLimit(room, "test-user-1");

    expect(result.valid).toBe(true);
    expect(result.currentActions).toBeDefined();
    expect(result.currentActions).toEqual(existingActions);

    // Verify that the function didn't modify the existing actions
    expect(room.gameState.playerActions["test-user-1"]).toEqual(existingActions);
  });

  it("should handle empty playerActions object", () => {
    // Create a mock room with empty playerActions object
    const room = createMockRoom("TEST01", {
      players: [createMockUser("test-user-1", "Test User", "test@example.com")],
      gameState: {
        ...createMockRoom().gameState,
        playerActions: {}, // Empty object
      },
    });

    // Call validateCardDrawLimit which should create actions for the user
    const result = validateCardDrawLimit(room, "test-user-1");

    expect(result.valid).toBe(true);
    expect(result.currentActions).toBeDefined();
    expect(result.currentActions.drawnHeart).toBe(false);
    expect(result.currentActions.drawnMagic).toBe(false);
    expect(result.currentActions.heartsPlaced).toBe(0);
    expect(result.currentActions.magicCardsUsed).toBe(0);

    // Verify that the function added the user's actions
    expect(room.gameState.playerActions["test-user-1"]).toBeDefined();
  });

  it("should handle multiple users in the same room", () => {
    // Create a mock room with multiple users
    const room = createMockRoom("TEST01", {
      players: [
        createMockUser("test-user-1", "Test User 1", "test1@example.com"),
        createMockUser("test-user-2", "Test User 2", "test2@example.com"),
      ],
      gameState: {
        ...createMockRoom().gameState,
        playerActions: undefined,
      },
    });

    // Call validateCardDrawLimit for first user
    const result1 = validateCardDrawLimit(room, "test-user-1");
    expect(result1.valid).toBe(true);
    expect(result1.currentActions.drawnHeart).toBe(false);

    // Call validateCardDrawLimit for second user
    const result2 = validateCardDrawLimit(room, "test-user-2");
    expect(result2.valid).toBe(true);
    expect(result2.currentActions.drawnHeart).toBe(false);

    // Verify that both users have separate playerActions
    expect(room.gameState.playerActions["test-user-1"]).toBeDefined();
    expect(room.gameState.playerActions["test-user-2"]).toBeDefined();
    expect(room.gameState.playerActions["test-user-1"]).not.toBe(room.gameState.playerActions["test-user-2"]);
  });
});