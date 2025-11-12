import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "socket.io";
import { createServer } from "node:http";
import {
  canPlaceMoreHearts,
  recordHeartPlacement,
  resetPlayerActions,
} from "../../server.js";

describe("canPlaceMoreHearts Integration Tests", () => {
  let httpServer;
  let io;
  let testRoomCode = "TEST12";
  let testUserId = "user123";
  let testRoom;

  beforeAll(async () => {
    // Create test server
    httpServer = createServer();
    io = new Server(httpServer);
    await new Promise((resolve) => {
      httpServer.listen(() => {
        resolve();
      });
    });

    // Create test room with initial game state
    testRoom = {
      code: testRoomCode,
      players: [
        {
          userId: testUserId,
          name: "Test Player",
          email: "test@example.com",
          isReady: true,
          score: 0,
          joinedAt: new Date(),
        },
      ],
      maxPlayers: 2,
      gameState: {
        tiles: [],
        gameStarted: true,
        currentPlayer: { userId: testUserId, name: "Test Player" },
        deck: { emoji: "💌", cards: 16, type: "hearts" },
        magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
        playerHands: {
          [testUserId]: [],
        },
        shields: {},
        turnCount: 1,
      },
    };
  });

  afterAll(() => {
    if (httpServer) {
      httpServer.close();
    }
    if (io) {
      io.close();
    }
  });

  test("should allow placement when no playerActions exist", () => {
    const room = {
      gameState: {}
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should allow placement when user has not placed any hearts", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: { heartsPlaced: 0 }
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should allow placement when user has placed 1 heart", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: { heartsPlaced: 1 }
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should deny placement when user has placed 2 hearts", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: { heartsPlaced: 2 }
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(false);
  });

  test("should allow placement when user has no playerActions entry", () => {
    const room = {
      gameState: {
        playerActions: {
          user2: { heartsPlaced: 1 }
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should handle undefined heartsPlaced gracefully", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: {}
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should work with recordHeartPlacement integration", () => {
    const room = {
      gameState: {
        playerActions: {}
      }
    };

    // Initial state - should allow
    expect(canPlaceMoreHearts(room, "user1")).toBe(true);

    // Place first heart
    recordHeartPlacement(room, "user1");
    expect(canPlaceMoreHearts(room, "user1")).toBe(true);

    // Place second heart
    recordHeartPlacement(room, "user1");
    expect(canPlaceMoreHearts(room, "user1")).toBe(false);
  });

  test("should work with resetPlayerActions integration", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: { heartsPlaced: 2 }
        }
      }
    };

    // Should deny at 2 hearts
    expect(canPlaceMoreHearts(room, "user1")).toBe(false);

    // Reset actions
    resetPlayerActions(room, "user1");
    expect(canPlaceMoreHearts(room, "user1")).toBe(true);
  });

  test("should handle invalid room gracefully", () => {
    expect(canPlaceMoreHearts(null, "user1")).toBe(true);
    expect(canPlaceMoreHearts(undefined, "user1")).toBe(true);
    expect(canPlaceMoreHearts({}, "user1")).toBe(true);
  });

  test("should handle different users independently", () => {
    const room = {
      gameState: {
        playerActions: {
          user1: { heartsPlaced: 2 }, // Maxed out
          user2: { heartsPlaced: 1 }  // Can still place
        }
      }
    };

    expect(canPlaceMoreHearts(room, "user1")).toBe(false);
    expect(canPlaceMoreHearts(room, "user2")).toBe(true);
    expect(canPlaceMoreHearts(room, "user3")).toBe(true); // New user
  });
});