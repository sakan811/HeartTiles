import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "socket.io";
import { createServer } from "node:http";
import {
  recordHeartPlacement,
  saveRoom,
  findPlayerByUserId,
  selectRandomStartingPlayer,
  generateSingleHeart,
  generateSingleMagicCard,
} from "../../server.js";

describe("recordHeartPlacement", () => {
  let httpServer;
  let io;
  let serverSocket;
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

  it("should initialize playerActions for new user and record first heart placement", () => {
    // Ensure playerActions doesn't exist initially
    delete testRoom.gameState.playerActions;

    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions).toBeDefined();
    expect(testRoom.gameState.playerActions[testUserId]).toBeDefined();
    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(1);
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(0);
  });

  it("should increment heartsPlaced for existing user", () => {
    // Set up existing playerActions with heartsPlaced: 1
    testRoom.gameState.playerActions = {
      [testUserId]: {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 0,
      },
    };

    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(2);
    // Other properties should remain unchanged
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(true);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(0);
  });

  it("should handle undefined heartsPlaced and initialize to 1", () => {
    // Set up playerActions without heartsPlaced property
    testRoom.gameState.playerActions = {
      [testUserId]: {
        drawnHeart: false,
        drawnMagic: true,
        // heartsPlaced is intentionally missing
        magicCardsUsed: 1,
      },
    };

    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(1);
    // Other properties should remain unchanged
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(true);
    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(1);
  });

  it("should handle null heartsPlaced and initialize to 1", () => {
    // Set up playerActions with null heartsPlaced
    testRoom.gameState.playerActions = {
      [testUserId]: {
        drawnHeart: false,
        drawnMagic: false,
        heartsPlaced: null,
        magicCardsUsed: 0,
      },
    };

    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(1);
  });

  it("should handle multiple consecutive heart placements", () => {
    // Start fresh
    delete testRoom.gameState.playerActions;

    // Place 3 hearts consecutively
    recordHeartPlacement(testRoom, testUserId);
    recordHeartPlacement(testRoom, testUserId);
    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(3);
  });

  it("should handle different users independently", () => {
    const secondUserId = "user456";

    // Reset playerActions to start fresh
    delete testRoom.gameState.playerActions;

    // Add second player to room
    testRoom.players.push({
      userId: secondUserId,
      name: "Second Player",
      email: "second@example.com",
      isReady: true,
      score: 0,
      joinedAt: new Date(),
    });

    // Record placements for both users
    recordHeartPlacement(testRoom, testUserId);
    recordHeartPlacement(testRoom, secondUserId);
    recordHeartPlacement(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(2);
    expect(testRoom.gameState.playerActions[secondUserId].heartsPlaced).toBe(1);

    // Verify both users have independent playerActions
    expect(testRoom.gameState.playerActions[testUserId]).not.toBe(
      testRoom.gameState.playerActions[secondUserId],
    );
  });
});
