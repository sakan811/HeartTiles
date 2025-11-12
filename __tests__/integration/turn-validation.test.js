import { describe, it, expect, beforeEach } from "vitest";

// Import the validation function from server.js
import {
  validateTurn,
  generateTiles,
  validateRoomState,
  validatePlayerInRoom,
} from "../../server.js";

// Import test utilities from setup
import { createMockRoom, createMockGameState } from "./setup.js";

describe("Turn Validation Integration Tests", () => {
  let testRoom;
  let testUserId1;
  let testUserId2;

  beforeEach(() => {
    // Reset test data before each test
    testUserId1 = "507f1f77bcf86cd799439011";
    testUserId2 = "507f1f77bcf86cd799439012";

    // Create a fresh room for each test
    testRoom = createMockRoom("TURN01", {
      players: [
        {
          userId: testUserId1,
          name: "Player 1",
          email: "player1@test.com",
          isReady: true,
          score: 0,
        },
        {
          userId: testUserId2,
          name: "Player 2",
          email: "player2@test.com",
          isReady: true,
          score: 0,
        },
      ],
    });
  });

  describe("validateTurn Function Tests", () => {
    it("should reject turn validation when game has not started", () => {
      // Game not started
      testRoom.gameState.gameStarted = false;
      testRoom.gameState.currentPlayer = null;

      const result = validateTurn(testRoom, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Game not started");
    });

    it("should reject turn validation when currentPlayer is null", () => {
      // Game started but no current player set
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = null;

      const result = validateTurn(testRoom, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should reject turn validation when userId does not match currentPlayer", () => {
      // Game started with player 1 as current
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId1,
        name: "Player 1",
      };

      // But player 2 tries to validate
      const result = validateTurn(testRoom, testUserId2);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should accept turn validation when userId matches currentPlayer", () => {
      // Game started with player 1 as current
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId1,
        name: "Player 1",
      };

      // Player 1 validates their turn
      const result = validateTurn(testRoom, testUserId1);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should handle edge case with undefined room", () => {
      const result = validateTurn(undefined, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Game not started");
    });

    it("should handle edge case with null room", () => {
      const result = validateTurn(null, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Game not started");
    });

    it("should handle edge case with room missing gameState", () => {
      const roomWithoutGameState = {
        code: "TEST01",
        players: [],
        // No gameState property
      };

      const result = validateTurn(roomWithoutGameState, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Game not started");
    });

    it("should handle edge case with gameState missing gameStarted", () => {
      const roomWithIncompleteState = {
        code: "TEST01",
        players: [],
        gameState: {
          // Missing gameStarted property
          currentPlayer: {
            userId: testUserId1,
            name: "Player 1",
          },
        },
      };

      const result = validateTurn(roomWithIncompleteState, testUserId1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Game not started");
    });
  });

  describe("Turn Validation Flow Integration", () => {
    it("should simulate complete turn flow from game start to turn changes", async () => {
      // Set up game in started state
      testRoom.gameState = createMockGameState();
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId1,
        name: "Player 1",
      };
      testRoom.gameState.turnCount = 1;

      // Player 1 should be able to take their turn
      let result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(true);

      // Player 2 should NOT be able to take their turn
      result = validateTurn(testRoom, testUserId2);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");

      // Simulate turn change - now it's player 2's turn
      testRoom.gameState.currentPlayer = {
        userId: testUserId2,
        name: "Player 2",
      };
      testRoom.gameState.turnCount = 2;

      // Now player 2 should be able to take their turn
      result = validateTurn(testRoom, testUserId2);
      expect(result.valid).toBe(true);

      // And player 1 should NOT be able to take their turn
      result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should handle turn validation with real room structure from game flow", () => {
      // Create room that mimics real game initialization
      const realGameRoom = createMockRoom("REAL01", {
        players: [
          {
            userId: testUserId1,
            name: "Alice",
            email: "alice@test.com",
            isReady: true,
            score: 0,
          },
          {
            userId: testUserId2,
            name: "Bob",
            email: "bob@test.com",
            isReady: true,
            score: 0,
          },
        ],
        gameState: {
          tiles: generateTiles(),
          gameStarted: true,
          currentPlayer: {
            userId: testUserId1,
            name: "Alice",
          },
          deck: { emoji: "💌", cards: 16, type: "hearts" },
          magicDeck: { emoji: "🔮", cards: 16, type: "magic" },
          playerHands: {
            [testUserId1]: [
              { id: "h1", type: "heart", color: "red", value: 2, emoji: "❤️" },
              {
                id: "h2",
                type: "heart",
                color: "yellow",
                value: 1,
                emoji: "💛",
              },
            ],
            [testUserId2]: [
              {
                id: "h3",
                type: "heart",
                color: "green",
                value: 3,
                emoji: "💚",
              },
              { id: "h4", type: "heart", color: "red", value: 1, emoji: "❤️" },
            ],
          },
          shields: {},
          turnCount: 1,
          playerActions: {
            [testUserId1]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 0,
              magicCardsUsed: 0,
            },
            [testUserId2]: {
              drawnHeart: false,
              drawnMagic: false,
              heartsPlaced: 0,
              magicCardsUsed: 0,
            },
          },
        },
      });

      // Alice should be able to validate her turn
      let result = validateTurn(realGameRoom, testUserId1);
      expect(result.valid).toBe(true);

      // Bob should NOT be able to validate his turn
      result = validateTurn(realGameRoom, testUserId2);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should maintain turn validation consistency with other validation functions", () => {
      // Set up a valid game state
      testRoom.gameState = createMockGameState();
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId1,
        name: "Player 1",
      };

      // All validations should pass for current player
      const roomStateValidation = validateRoomState(testRoom);
      const playerInRoomValidation = validatePlayerInRoom(
        testRoom,
        testUserId1,
      );
      const turnValidation = validateTurn(testRoom, testUserId1);

      expect(roomStateValidation.valid).toBe(true);
      expect(playerInRoomValidation.valid).toBe(true);
      expect(turnValidation.valid).toBe(true);

      // Turn validation should fail for non-current player even if other validations pass
      const turnValidationForOtherPlayer = validateTurn(testRoom, testUserId2);
      expect(turnValidationForOtherPlayer.valid).toBe(false);
      expect(turnValidationForOtherPlayer.error).toBe("Not your turn");
    });
  });

  describe("Turn Validation Error Cases", () => {
    it("should provide clear error messages for different failure scenarios", () => {
      // Test game not started error
      testRoom.gameState.gameStarted = false;
      testRoom.gameState.currentPlayer = null;

      let result = validateTurn(testRoom, testUserId1);
      expect(result.error).toBe("Game not started");

      // Test not your turn error (game started but wrong player)
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId2,
        name: "Player 2",
      };

      result = validateTurn(testRoom, testUserId1);
      expect(result.error).toBe("Not your turn");

      // Test not your turn error (game started but no current player)
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = null;

      result = validateTurn(testRoom, testUserId1);
      expect(result.error).toBe("Not your turn");
    });

    it("should handle malformed currentPlayer objects", () => {
      testRoom.gameState.gameStarted = true;

      // Test with currentPlayer missing userId
      testRoom.gameState.currentPlayer = {
        name: "Player 1",
        // Missing userId
      };

      let result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");

      // Test with currentPlayer having null userId
      testRoom.gameState.currentPlayer = {
        userId: null,
        name: "Player 1",
      };

      result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");

      // Test with currentPlayer having undefined userId
      testRoom.gameState.currentPlayer = {
        userId: undefined,
        name: "Player 1",
      };

      result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");

      // Test with currentPlayer having empty string userId
      testRoom.gameState.currentPlayer = {
        userId: "",
        name: "Player 1",
      };

      result = validateTurn(testRoom, testUserId1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });
  });

  describe("Turn Validation Performance and Edge Cases", () => {
    it("should handle rapid successive validations efficiently", () => {
      // Set up valid game state
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: testUserId1,
        name: "Player 1",
      };

      // Perform many validations rapidly
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const result = validateTurn(testRoom, testUserId1);
        expect(result.valid).toBe(true);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 1000 validations in reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100);
    });

    it("should handle unusual userId formats", () => {
      testRoom.gameState.gameStarted = true;
      testRoom.gameState.currentPlayer = {
        userId: "unusual-user-id-123",
        name: "Unusual User",
      };

      // Test with exact match
      let result = validateTurn(testRoom, "unusual-user-id-123");
      expect(result.valid).toBe(true);

      // Test with different formats
      const unusualUserIds = [
        "user_with_underscores",
        "user-with-dashes",
        "user123",
        "123user",
        "USERID",
        "userId",
      ];

      unusualUserIds.forEach((userId) => {
        testRoom.gameState.currentPlayer.userId = userId;
        result = validateTurn(testRoom, userId);
        expect(result.valid).toBe(true);

        // Test with different case (should fail)
        result = validateTurn(testRoom, userId.toUpperCase());
        if (userId !== userId.toUpperCase()) {
          expect(result.valid).toBe(false);
        }
      });
    });
  });
});
