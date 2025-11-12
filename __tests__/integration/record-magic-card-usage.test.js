import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "socket.io";
import { createServer } from "node:http";
import { recordMagicCardUsage, canUseMoreMagicCards } from "../../server.js";

describe("recordMagicCardUsage", () => {
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

  it("should initialize playerActions structure when missing", () => {
    // Ensure playerActions doesn't exist initially
    delete testRoom.gameState.playerActions;

    recordMagicCardUsage(testRoom, testUserId);

    expect(testRoom.gameState.playerActions).toBeDefined();
    expect(testRoom.gameState.playerActions[testUserId]).toBeDefined();
    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(1);
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(0);
  });

  it("should increment magicCardsUsed counter", () => {
    // Set up existing playerActions with magicCardsUsed: 2
    testRoom.gameState.playerActions = {
      [testUserId]: {
        drawnHeart: true,
        drawnMagic: false,
        heartsPlaced: 1,
        magicCardsUsed: 2,
      },
    };

    recordMagicCardUsage(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(3);
    // Other properties should remain unchanged
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(true);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(1);
  });

  it("should handle undefined magicCardsUsed property", () => {
    // Set up playerActions without magicCardsUsed property
    testRoom.gameState.playerActions = {
      [testUserId]: {
        drawnHeart: false,
        drawnMagic: true,
        heartsPlaced: 1,
        // magicCardsUsed is intentionally missing
      },
    };

    recordMagicCardUsage(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(1);
    // Other properties should remain unchanged
    expect(testRoom.gameState.playerActions[testUserId].drawnHeart).toBe(false);
    expect(testRoom.gameState.playerActions[testUserId].drawnMagic).toBe(true);
    expect(testRoom.gameState.playerActions[testUserId].heartsPlaced).toBe(1);
  });

  it("should handle multiple consecutive magic card usage", () => {
    // Start fresh
    delete testRoom.gameState.playerActions;

    // Use 3 magic cards consecutively
    recordMagicCardUsage(testRoom, testUserId);
    recordMagicCardUsage(testRoom, testUserId);
    recordMagicCardUsage(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(3);
  });

  it("should work with canUseMoreMagicCards function", () => {
    // Start fresh
    delete testRoom.gameState.playerActions;

    // Initially can use magic cards
    expect(canUseMoreMagicCards(testRoom, testUserId)).toBe(true);

    // Record first usage
    recordMagicCardUsage(testRoom, testUserId);
    expect(canUseMoreMagicCards(testRoom, testUserId)).toBe(false); // Should be false after first usage (limit is 1)

    // Record second usage (already at limit)
    recordMagicCardUsage(testRoom, testUserId);
    expect(canUseMoreMagicCards(testRoom, testUserId)).toBe(false);
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

    // Record magic card usage for both users
    recordMagicCardUsage(testRoom, testUserId);
    recordMagicCardUsage(testRoom, secondUserId);
    recordMagicCardUsage(testRoom, testUserId);

    expect(testRoom.gameState.playerActions[testUserId].magicCardsUsed).toBe(2);
    expect(testRoom.gameState.playerActions[secondUserId].magicCardsUsed).toBe(
      1,
    );

    // Verify both users have independent playerActions
    expect(testRoom.gameState.playerActions[testUserId]).not.toBe(
      testRoom.gameState.playerActions[secondUserId],
    );
  });

  it("should handle room with missing playerActions but existing gameState", () => {
    const roomWithGameStateOnly = {
      code: "TEST99",
      players: [
        {
          userId: "test-user",
          name: "Test User",
          email: "test@example.com",
          isReady: true,
          score: 0,
          joinedAt: new Date(),
        },
      ],
      maxPlayers: 2,
      gameState: {
        tiles: [],
        gameStarted: false,
        currentPlayer: null,
        deck: { emoji: "💌", cards: 16, type: "hearts" },
        magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
        playerHands: {},
        shields: {},
        turnCount: 0,
        // playerActions is missing
      },
    };

    recordMagicCardUsage(roomWithGameStateOnly, "test-user");

    expect(roomWithGameStateOnly.gameState.playerActions).toBeDefined();
    expect(
      roomWithGameStateOnly.gameState.playerActions["test-user"].magicCardsUsed,
    ).toBe(1);
  });
});
